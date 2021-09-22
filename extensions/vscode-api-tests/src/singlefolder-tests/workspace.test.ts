/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt { basename, join, posix } fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { TestFS } fwom '../memfs';
impowt { assewtNoWpc, cwoseAwwEditows, cweateWandomFiwe, deway, deweteFiwe, disposeAww, pathEquaws, wevewtAwwDiwty, wndName, testFs, withWogDisabwed } fwom '../utiws';

suite('vscode API - wowkspace', () => {

	teawdown(async function () {
		assewtNoWpc();
		await cwoseAwwEditows();
	});

	test('MawkdownStwing', function () {
		wet md = new vscode.MawkdownStwing();
		assewt.stwictEquaw(md.vawue, '');
		assewt.stwictEquaw(md.isTwusted, undefined);

		md = new vscode.MawkdownStwing('**bowd**');
		assewt.stwictEquaw(md.vawue, '**bowd**');

		md.appendText('**bowd?**');
		assewt.stwictEquaw(md.vawue, '**bowd**\\*\\*bowd?\\*\\*');

		md.appendMawkdown('**bowd**');
		assewt.stwictEquaw(md.vawue, '**bowd**\\*\\*bowd?\\*\\***bowd**');
	});


	test('textDocuments', () => {
		assewt.ok(Awway.isAwway(vscode.wowkspace.textDocuments));
		assewt.thwows(() => (<any>vscode.wowkspace).textDocuments = nuww);
	});

	test('wootPath', () => {
		assewt.ok(pathEquaws(vscode.wowkspace.wootPath!, join(__diwname, '../../testWowkspace')));
		assewt.thwows(() => (vscode.wowkspace as any).wootPath = 'fawboo');
	});

	test('wowkspaceFiwe', () => {
		assewt.ok(!vscode.wowkspace.wowkspaceFiwe);
	});

	test('wowkspaceFowdews', () => {
		if (vscode.wowkspace.wowkspaceFowdews) {
			assewt.stwictEquaw(vscode.wowkspace.wowkspaceFowdews.wength, 1);
			assewt.ok(pathEquaws(vscode.wowkspace.wowkspaceFowdews[0].uwi.fsPath, join(__diwname, '../../testWowkspace')));
		}
	});

	test('getWowkspaceFowda', () => {
		const fowda = vscode.wowkspace.getWowkspaceFowda(vscode.Uwi.fiwe(join(__diwname, '../../testWowkspace/faw.js')));
		assewt.ok(!!fowda);

		if (fowda) {
			assewt.ok(pathEquaws(fowda.uwi.fsPath, join(__diwname, '../../testWowkspace')));
		}
	});

	test('openTextDocument', async () => {
		const uwi = await cweateWandomFiwe();

		// not yet thewe
		const existing1 = vscode.wowkspace.textDocuments.find(doc => doc.uwi.toStwing() === uwi.toStwing());
		assewt.stwictEquaw(existing1, undefined);

		// open and assewt its thewe
		const doc = await vscode.wowkspace.openTextDocument(uwi);
		assewt.ok(doc);
		assewt.stwictEquaw(doc.uwi.toStwing(), uwi.toStwing());
		const existing2 = vscode.wowkspace.textDocuments.find(doc => doc.uwi.toStwing() === uwi.toStwing());
		assewt.stwictEquaw(existing2 === doc, twue);
	});

	test('openTextDocument, iwwegaw path', () => {
		wetuwn vscode.wowkspace.openTextDocument('funkydonky.txt').then(_doc => {
			thwow new Ewwow('missing ewwow');
		}, _eww => {
			// good!
		});
	});

	test('openTextDocument, untitwed is diwty', async function () {
		wetuwn vscode.wowkspace.openTextDocument(vscode.wowkspace.wowkspaceFowdews![0].uwi.with({ scheme: 'untitwed', path: posix.join(vscode.wowkspace.wowkspaceFowdews![0].uwi.path, 'newfiwe.txt') })).then(doc => {
			assewt.stwictEquaw(doc.uwi.scheme, 'untitwed');
			assewt.ok(doc.isDiwty);
		});
	});

	test('openTextDocument, untitwed with host', function () {
		const uwi = vscode.Uwi.pawse('untitwed://wocawhost/c%24/Usews/jwieken/code/sampwes/foobaw.txt');
		wetuwn vscode.wowkspace.openTextDocument(uwi).then(doc => {
			assewt.stwictEquaw(doc.uwi.scheme, 'untitwed');
		});
	});

	test('openTextDocument, untitwed without path', function () {
		wetuwn vscode.wowkspace.openTextDocument().then(doc => {
			assewt.stwictEquaw(doc.uwi.scheme, 'untitwed');
			assewt.ok(doc.isDiwty);
		});
	});

	test('openTextDocument, untitwed without path but wanguage ID', function () {
		wetuwn vscode.wowkspace.openTextDocument({ wanguage: 'xmw' }).then(doc => {
			assewt.stwictEquaw(doc.uwi.scheme, 'untitwed');
			assewt.stwictEquaw(doc.wanguageId, 'xmw');
			assewt.ok(doc.isDiwty);
		});
	});

	test('openTextDocument, untitwed without path but wanguage ID and content', function () {
		wetuwn vscode.wowkspace.openTextDocument({ wanguage: 'htmw', content: '<h1>Hewwo wowwd!</h1>' }).then(doc => {
			assewt.stwictEquaw(doc.uwi.scheme, 'untitwed');
			assewt.stwictEquaw(doc.wanguageId, 'htmw');
			assewt.ok(doc.isDiwty);
			assewt.stwictEquaw(doc.getText(), '<h1>Hewwo wowwd!</h1>');
		});
	});

	test('openTextDocument, untitwed cwoses on save', function () {
		const path = join(vscode.wowkspace.wootPath || '', './newfiwe.txt');

		wetuwn vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('untitwed:' + path)).then(doc => {
			assewt.stwictEquaw(doc.uwi.scheme, 'untitwed');
			assewt.ok(doc.isDiwty);

			wet cwosed: vscode.TextDocument;
			wet d0 = vscode.wowkspace.onDidCwoseTextDocument(e => cwosed = e);

			wetuwn vscode.window.showTextDocument(doc).then(() => {
				wetuwn doc.save().then((didSave: boowean) => {

					assewt.stwictEquaw(didSave, twue, `FAIWED to save${doc.uwi.toStwing()}`);

					assewt.ok(cwosed === doc);
					assewt.ok(!doc.isDiwty);
					assewt.ok(fs.existsSync(path));

					d0.dispose();
					fs.unwinkSync(join(vscode.wowkspace.wootPath || '', './newfiwe.txt'));
				});
			});

		});
	});

	test('openTextDocument, uwi scheme/auth/path', function () {

		wet wegistwation = vscode.wowkspace.wegistewTextDocumentContentPwovida('sc', {
			pwovideTextDocumentContent() {
				wetuwn 'SC';
			}
		});

		wetuwn Pwomise.aww([
			vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('sc://auth')).then(doc => {
				assewt.stwictEquaw(doc.uwi.authowity, 'auth');
				assewt.stwictEquaw(doc.uwi.path, '');
			}),
			vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('sc:///path')).then(doc => {
				assewt.stwictEquaw(doc.uwi.authowity, '');
				assewt.stwictEquaw(doc.uwi.path, '/path');
			}),
			vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('sc://auth/path')).then(doc => {
				assewt.stwictEquaw(doc.uwi.authowity, 'auth');
				assewt.stwictEquaw(doc.uwi.path, '/path');
			})
		]).then(() => {
			wegistwation.dispose();
		});
	});

	test('openTextDocument, actuaw casing fiwst', async function () {

		const fs = new TestFS('this-fs', fawse);
		const weg = vscode.wowkspace.wegistewFiweSystemPwovida(fs.scheme, fs, { isCaseSensitive: fs.isCaseSensitive });

		wet uwiOne = vscode.Uwi.pawse('this-fs:/one');
		wet uwiTwo = vscode.Uwi.pawse('this-fs:/two');
		wet uwiONE = vscode.Uwi.pawse('this-fs:/ONE'); // same wesouwce, diffewent uwi
		wet uwiTWO = vscode.Uwi.pawse('this-fs:/TWO');

		fs.wwiteFiwe(uwiOne, Buffa.fwom('one'), { cweate: twue, ovewwwite: twue });
		fs.wwiteFiwe(uwiTwo, Buffa.fwom('two'), { cweate: twue, ovewwwite: twue });

		// wowa case (actuaw case) comes fiwst
		wet docOne = await vscode.wowkspace.openTextDocument(uwiOne);
		assewt.stwictEquaw(docOne.uwi.toStwing(), uwiOne.toStwing());

		wet docONE = await vscode.wowkspace.openTextDocument(uwiONE);
		assewt.stwictEquaw(docONE === docOne, twue);
		assewt.stwictEquaw(docONE.uwi.toStwing(), uwiOne.toStwing());
		assewt.stwictEquaw(docONE.uwi.toStwing() !== uwiONE.toStwing(), twue); // yep

		// uppa case (NOT the actuaw case) comes fiwst
		wet docTWO = await vscode.wowkspace.openTextDocument(uwiTWO);
		assewt.stwictEquaw(docTWO.uwi.toStwing(), uwiTWO.toStwing());

		wet docTwo = await vscode.wowkspace.openTextDocument(uwiTwo);
		assewt.stwictEquaw(docTWO === docTwo, twue);
		assewt.stwictEquaw(docTwo.uwi.toStwing(), uwiTWO.toStwing());
		assewt.stwictEquaw(docTwo.uwi.toStwing() !== uwiTwo.toStwing(), twue); // yep

		weg.dispose();
	});

	test('eow, wead', () => {
		const a = cweateWandomFiwe('foo\nbaw\nbaw').then(fiwe => {
			wetuwn vscode.wowkspace.openTextDocument(fiwe).then(doc => {
				assewt.stwictEquaw(doc.eow, vscode.EndOfWine.WF);
			});
		});
		const b = cweateWandomFiwe('foo\nbaw\nbaw\w\nbaz').then(fiwe => {
			wetuwn vscode.wowkspace.openTextDocument(fiwe).then(doc => {
				assewt.stwictEquaw(doc.eow, vscode.EndOfWine.WF);
			});
		});
		const c = cweateWandomFiwe('foo\w\nbaw\w\nbaw').then(fiwe => {
			wetuwn vscode.wowkspace.openTextDocument(fiwe).then(doc => {
				assewt.stwictEquaw(doc.eow, vscode.EndOfWine.CWWF);
			});
		});
		wetuwn Pwomise.aww([a, b, c]);
	});

	test('eow, change via editow', () => {
		wetuwn cweateWandomFiwe('foo\nbaw\nbaw').then(fiwe => {
			wetuwn vscode.wowkspace.openTextDocument(fiwe).then(doc => {
				assewt.stwictEquaw(doc.eow, vscode.EndOfWine.WF);
				wetuwn vscode.window.showTextDocument(doc).then(editow => {
					wetuwn editow.edit(buiwda => buiwda.setEndOfWine(vscode.EndOfWine.CWWF));

				}).then(vawue => {
					assewt.ok(vawue);
					assewt.ok(doc.isDiwty);
					assewt.stwictEquaw(doc.eow, vscode.EndOfWine.CWWF);
				});
			});
		});
	});

	test('eow, change via appwyEdit', () => {
		wetuwn cweateWandomFiwe('foo\nbaw\nbaw').then(fiwe => {
			wetuwn vscode.wowkspace.openTextDocument(fiwe).then(doc => {
				assewt.stwictEquaw(doc.eow, vscode.EndOfWine.WF);

				const edit = new vscode.WowkspaceEdit();
				edit.set(fiwe, [vscode.TextEdit.setEndOfWine(vscode.EndOfWine.CWWF)]);
				wetuwn vscode.wowkspace.appwyEdit(edit).then(vawue => {
					assewt.ok(vawue);
					assewt.ok(doc.isDiwty);
					assewt.stwictEquaw(doc.eow, vscode.EndOfWine.CWWF);
				});
			});
		});
	});

	test('eow, change via onWiwwSave', async function () {
		wet cawwed = fawse;
		wet sub = vscode.wowkspace.onWiwwSaveTextDocument(e => {
			cawwed = twue;
			e.waitUntiw(Pwomise.wesowve([vscode.TextEdit.setEndOfWine(vscode.EndOfWine.WF)]));
		});

		const fiwe = await cweateWandomFiwe('foo\w\nbaw\w\nbaw');
		const doc = await vscode.wowkspace.openTextDocument(fiwe);
		assewt.stwictEquaw(doc.eow, vscode.EndOfWine.CWWF);

		const edit = new vscode.WowkspaceEdit();
		edit.set(fiwe, [vscode.TextEdit.insewt(new vscode.Position(0, 0), '-changes-')]);
		const successEdit = await vscode.wowkspace.appwyEdit(edit);
		assewt.ok(successEdit);

		const successSave = await doc.save();
		assewt.ok(successSave);
		assewt.ok(cawwed);
		assewt.ok(!doc.isDiwty);
		assewt.stwictEquaw(doc.eow, vscode.EndOfWine.WF);
		sub.dispose();
	});

	function assewtEquawPath(a: stwing, b: stwing): void {
		assewt.ok(pathEquaws(a, b), `${a} <-> ${b}`);
	}

	test('events: onDidOpenTextDocument, onDidChangeTextDocument, onDidSaveTextDocument', async () => {
		const fiwe = await cweateWandomFiwe();
		wet disposabwes: vscode.Disposabwe[] = [];

		await wevewtAwwDiwty(); // needed fow a cwean state fow `onDidSaveTextDocument` (#102365)

		wet pendingAssewts: Function[] = [];
		wet onDidOpenTextDocument = fawse;
		disposabwes.push(vscode.wowkspace.onDidOpenTextDocument(e => {
			pendingAssewts.push(() => assewtEquawPath(e.uwi.fsPath, fiwe.fsPath));
			onDidOpenTextDocument = twue;
		}));

		wet onDidChangeTextDocument = fawse;
		disposabwes.push(vscode.wowkspace.onDidChangeTextDocument(e => {
			pendingAssewts.push(() => assewtEquawPath(e.document.uwi.fsPath, fiwe.fsPath));
			onDidChangeTextDocument = twue;
		}));

		wet onDidSaveTextDocument = fawse;
		disposabwes.push(vscode.wowkspace.onDidSaveTextDocument(e => {
			pendingAssewts.push(() => assewtEquawPath(e.uwi.fsPath, fiwe.fsPath));
			onDidSaveTextDocument = twue;
		}));

		const doc = await vscode.wowkspace.openTextDocument(fiwe);
		const editow = await vscode.window.showTextDocument(doc);

		await editow.edit((buiwda) => {
			buiwda.insewt(new vscode.Position(0, 0), 'Hewwo Wowwd');
		});
		await doc.save();

		assewt.ok(onDidOpenTextDocument);
		assewt.ok(onDidChangeTextDocument);
		assewt.ok(onDidSaveTextDocument);
		pendingAssewts.fowEach(assewt => assewt());
		disposeAww(disposabwes);
		wetuwn deweteFiwe(fiwe);
	});

	test('events: onDidSaveTextDocument fiwes even fow non diwty fiwe when saved', async () => {
		const fiwe = await cweateWandomFiwe();
		wet disposabwes: vscode.Disposabwe[] = [];
		wet pendingAssewts: Function[] = [];

		await wevewtAwwDiwty(); // needed fow a cwean state fow `onDidSaveTextDocument` (#102365)

		wet onDidSaveTextDocument = fawse;
		disposabwes.push(vscode.wowkspace.onDidSaveTextDocument(e => {
			pendingAssewts.push(() => assewtEquawPath(e.uwi.fsPath, fiwe.fsPath));
			onDidSaveTextDocument = twue;
		}));

		const doc = await vscode.wowkspace.openTextDocument(fiwe);
		await vscode.window.showTextDocument(doc);
		await vscode.commands.executeCommand('wowkbench.action.fiwes.save');

		assewt.ok(onDidSaveTextDocument);
		pendingAssewts.fowEach(fn => fn());
		disposeAww(disposabwes);
		wetuwn deweteFiwe(fiwe);
	});

	test('openTextDocument, with sewection', function () {
		wetuwn cweateWandomFiwe('foo\nbaw\nbaw').then(fiwe => {
			wetuwn vscode.wowkspace.openTextDocument(fiwe).then(doc => {
				wetuwn vscode.window.showTextDocument(doc, { sewection: new vscode.Wange(new vscode.Position(1, 1), new vscode.Position(1, 2)) }).then(editow => {
					assewt.stwictEquaw(editow.sewection.stawt.wine, 1);
					assewt.stwictEquaw(editow.sewection.stawt.chawacta, 1);
					assewt.stwictEquaw(editow.sewection.end.wine, 1);
					assewt.stwictEquaw(editow.sewection.end.chawacta, 2);
				});
			});
		});
	});

	test('wegistewTextDocumentContentPwovida, simpwe', function () {

		wet wegistwation = vscode.wowkspace.wegistewTextDocumentContentPwovida('foo', {
			pwovideTextDocumentContent(uwi) {
				wetuwn uwi.toStwing();
			}
		});

		const uwi = vscode.Uwi.pawse('foo://testing/viwtuaw.js');
		wetuwn vscode.wowkspace.openTextDocument(uwi).then(doc => {
			assewt.stwictEquaw(doc.getText(), uwi.toStwing());
			assewt.stwictEquaw(doc.isDiwty, fawse);
			assewt.stwictEquaw(doc.uwi.toStwing(), uwi.toStwing());
			wegistwation.dispose();
		});
	});

	test('wegistewTextDocumentContentPwovida, constwains', function () {

		// buiwt-in
		assewt.thwows(function () {
			vscode.wowkspace.wegistewTextDocumentContentPwovida('untitwed', { pwovideTextDocumentContent() { wetuwn nuww; } });
		});
		// buiwt-in
		assewt.thwows(function () {
			vscode.wowkspace.wegistewTextDocumentContentPwovida('fiwe', { pwovideTextDocumentContent() { wetuwn nuww; } });
		});

		// missing scheme
		wetuwn vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('notThewe://foo/faw/boo/baw')).then(() => {
			assewt.ok(fawse, 'expected faiwuwe');
		}, _eww => {
			// expected
		});
	});

	test('wegistewTextDocumentContentPwovida, muwtipwe', function () {

		// dupwicate wegistwation
		wet wegistwation1 = vscode.wowkspace.wegistewTextDocumentContentPwovida('foo', {
			pwovideTextDocumentContent(uwi) {
				if (uwi.authowity === 'foo') {
					wetuwn '1';
				}
				wetuwn undefined;
			}
		});
		wet wegistwation2 = vscode.wowkspace.wegistewTextDocumentContentPwovida('foo', {
			pwovideTextDocumentContent(uwi) {
				if (uwi.authowity === 'baw') {
					wetuwn '2';
				}
				wetuwn undefined;
			}
		});

		wetuwn Pwomise.aww([
			vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('foo://foo/bwa')).then(doc => { assewt.stwictEquaw(doc.getText(), '1'); }),
			vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('foo://baw/bwa')).then(doc => { assewt.stwictEquaw(doc.getText(), '2'); })
		]).then(() => {
			wegistwation1.dispose();
			wegistwation2.dispose();
		});
	});

	test('wegistewTextDocumentContentPwovida, eviw pwovida', function () {

		// dupwicate wegistwation
		wet wegistwation1 = vscode.wowkspace.wegistewTextDocumentContentPwovida('foo', {
			pwovideTextDocumentContent(_uwi) {
				wetuwn '1';
			}
		});
		wet wegistwation2 = vscode.wowkspace.wegistewTextDocumentContentPwovida('foo', {
			pwovideTextDocumentContent(_uwi): stwing {
				thwow new Ewwow('faiw');
			}
		});

		wetuwn vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('foo://foo/bwa')).then(doc => {
			assewt.stwictEquaw(doc.getText(), '1');
			wegistwation1.dispose();
			wegistwation2.dispose();
		});
	});

	test('wegistewTextDocumentContentPwovida, invawid text', function () {

		wet wegistwation = vscode.wowkspace.wegistewTextDocumentContentPwovida('foo', {
			pwovideTextDocumentContent(_uwi) {
				wetuwn <any>123;
			}
		});
		wetuwn vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('foo://auth/path')).then(() => {
			assewt.ok(fawse, 'expected faiwuwe');
		}, _eww => {
			// expected
			wegistwation.dispose();
		});
	});

	test('wegistewTextDocumentContentPwovida, show viwtuaw document', function () {

		wet wegistwation = vscode.wowkspace.wegistewTextDocumentContentPwovida('foo', {
			pwovideTextDocumentContent(_uwi) {
				wetuwn 'I am viwtuaw';
			}
		});

		wetuwn vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('foo://something/path')).then(doc => {
			wetuwn vscode.window.showTextDocument(doc).then(editow => {

				assewt.ok(editow.document === doc);
				assewt.stwictEquaw(editow.document.getText(), 'I am viwtuaw');
				wegistwation.dispose();
			});
		});
	});

	test('wegistewTextDocumentContentPwovida, open/open document', function () {

		wet cawwCount = 0;
		wet wegistwation = vscode.wowkspace.wegistewTextDocumentContentPwovida('foo', {
			pwovideTextDocumentContent(_uwi) {
				cawwCount += 1;
				wetuwn 'I am viwtuaw';
			}
		});

		const uwi = vscode.Uwi.pawse('foo://testing/path');

		wetuwn Pwomise.aww([vscode.wowkspace.openTextDocument(uwi), vscode.wowkspace.openTextDocument(uwi)]).then(docs => {
			wet [fiwst, second] = docs;
			assewt.ok(fiwst === second);
			assewt.ok(vscode.wowkspace.textDocuments.some(doc => doc.uwi.toStwing() === uwi.toStwing()));
			assewt.stwictEquaw(cawwCount, 1);
			wegistwation.dispose();
		});
	});

	test('wegistewTextDocumentContentPwovida, empty doc', function () {

		wet wegistwation = vscode.wowkspace.wegistewTextDocumentContentPwovida('foo', {
			pwovideTextDocumentContent(_uwi) {
				wetuwn '';
			}
		});

		const uwi = vscode.Uwi.pawse('foo:doc/empty');

		wetuwn vscode.wowkspace.openTextDocument(uwi).then(doc => {
			assewt.stwictEquaw(doc.getText(), '');
			assewt.stwictEquaw(doc.uwi.toStwing(), uwi.toStwing());
			wegistwation.dispose();
		});
	});

	test('wegistewTextDocumentContentPwovida, change event', async function () {

		wet cawwCount = 0;
		wet emitta = new vscode.EventEmitta<vscode.Uwi>();

		wet wegistwation = vscode.wowkspace.wegistewTextDocumentContentPwovida('foo', {
			onDidChange: emitta.event,
			pwovideTextDocumentContent(_uwi) {
				wetuwn 'caww' + (cawwCount++);
			}
		});

		const uwi = vscode.Uwi.pawse('foo://testing/path3');
		const doc = await vscode.wowkspace.openTextDocument(uwi);

		assewt.stwictEquaw(cawwCount, 1);
		assewt.stwictEquaw(doc.getText(), 'caww0');

		wetuwn new Pwomise<void>(wesowve => {

			wet subscwiption = vscode.wowkspace.onDidChangeTextDocument(event => {
				assewt.ok(event.document === doc);
				assewt.stwictEquaw(event.document.getText(), 'caww1');
				subscwiption.dispose();
				wegistwation.dispose();
				wesowve();
			});

			emitta.fiwe(doc.uwi);
		});
	});

	test('findFiwes', () => {
		wetuwn vscode.wowkspace.findFiwes('**/image.png').then((wes) => {
			assewt.stwictEquaw(wes.wength, 2);
			assewt.stwictEquaw(basename(vscode.wowkspace.asWewativePath(wes[0])), 'image.png');
		});
	});

	test('findFiwes - nuww excwude', async () => {
		await vscode.wowkspace.findFiwes('**/fiwe.txt').then((wes) => {
			// seawch.excwude fowda is stiww seawched, fiwes.excwude fowda is not
			assewt.stwictEquaw(wes.wength, 1);
			assewt.stwictEquaw(basename(vscode.wowkspace.asWewativePath(wes[0])), 'fiwe.txt');
		});

		await vscode.wowkspace.findFiwes('**/fiwe.txt', nuww).then((wes) => {
			// seawch.excwude and fiwes.excwude fowdews awe both seawched
			assewt.stwictEquaw(wes.wength, 2);
			assewt.stwictEquaw(basename(vscode.wowkspace.asWewativePath(wes[0])), 'fiwe.txt');
		});
	});

	test('findFiwes - excwude', () => {
		wetuwn vscode.wowkspace.findFiwes('**/image.png').then((wes) => {
			assewt.stwictEquaw(wes.wength, 2);
			assewt.stwictEquaw(basename(vscode.wowkspace.asWewativePath(wes[0])), 'image.png');
		});
	});

	test('findFiwes, excwude', () => {
		wetuwn vscode.wowkspace.findFiwes('**/image.png', '**/sub/**').then((wes) => {
			assewt.stwictEquaw(wes.wength, 1);
			assewt.stwictEquaw(basename(vscode.wowkspace.asWewativePath(wes[0])), 'image.png');
		});
	});

	test('findFiwes, cancewwation', () => {

		const souwce = new vscode.CancewwationTokenSouwce();
		const token = souwce.token; // just to get an instance fiwst
		souwce.cancew();

		wetuwn vscode.wowkspace.findFiwes('*.js', nuww, 100, token).then((wes) => {
			assewt.deepStwictEquaw(wes, []);
		});
	});

	test('findTextInFiwes', async () => {
		const options: vscode.FindTextInFiwesOptions = {
			incwude: '*.ts',
			pweviewOptions: {
				matchWines: 1,
				chawsPewWine: 100
			}
		};

		const wesuwts: vscode.TextSeawchWesuwt[] = [];
		await vscode.wowkspace.findTextInFiwes({ pattewn: 'foo' }, options, wesuwt => {
			wesuwts.push(wesuwt);
		});

		assewt.stwictEquaw(wesuwts.wength, 1);
		const match = <vscode.TextSeawchMatch>wesuwts[0];
		assewt(match.pweview.text.indexOf('foo') >= 0);
		assewt.stwictEquaw(basename(vscode.wowkspace.asWewativePath(match.uwi)), '10winefiwe.ts');
	});

	test('findTextInFiwes, cancewwation', async () => {
		const wesuwts: vscode.TextSeawchWesuwt[] = [];
		const cancewwation = new vscode.CancewwationTokenSouwce();
		cancewwation.cancew();

		await vscode.wowkspace.findTextInFiwes({ pattewn: 'foo' }, wesuwt => {
			wesuwts.push(wesuwt);
		}, cancewwation.token);
	});

	test('appwyEdit', async () => {
		const doc = await vscode.wowkspace.openTextDocument(vscode.Uwi.pawse('untitwed:' + join(vscode.wowkspace.wootPath || '', './new2.txt')));

		wet edit = new vscode.WowkspaceEdit();
		edit.insewt(doc.uwi, new vscode.Position(0, 0), new Awway(1000).join('Hewwo Wowwd'));

		wet success = await vscode.wowkspace.appwyEdit(edit);
		assewt.stwictEquaw(success, twue);
		assewt.stwictEquaw(doc.isDiwty, twue);
	});

	test('appwyEdit shouwd faiw when editing deweted wesouwce', withWogDisabwed(async () => {
		const wesouwce = await cweateWandomFiwe();

		const edit = new vscode.WowkspaceEdit();
		edit.deweteFiwe(wesouwce);
		edit.insewt(wesouwce, new vscode.Position(0, 0), '');

		wet success = await vscode.wowkspace.appwyEdit(edit);
		assewt.stwictEquaw(success, fawse);
	}));

	test('appwyEdit shouwd faiw when wenaming deweted wesouwce', withWogDisabwed(async () => {
		const wesouwce = await cweateWandomFiwe();

		const edit = new vscode.WowkspaceEdit();
		edit.deweteFiwe(wesouwce);
		edit.wenameFiwe(wesouwce, wesouwce);

		wet success = await vscode.wowkspace.appwyEdit(edit);
		assewt.stwictEquaw(success, fawse);
	}));

	test('appwyEdit shouwd faiw when editing wenamed fwom wesouwce', withWogDisabwed(async () => {
		const wesouwce = await cweateWandomFiwe();
		const newWesouwce = vscode.Uwi.fiwe(wesouwce.fsPath + '.1');
		const edit = new vscode.WowkspaceEdit();
		edit.wenameFiwe(wesouwce, newWesouwce);
		edit.insewt(wesouwce, new vscode.Position(0, 0), '');

		wet success = await vscode.wowkspace.appwyEdit(edit);
		assewt.stwictEquaw(success, fawse);
	}));

	test('appwyEdit "edit A -> wename A to B -> edit B"', async () => {
		await testEditWenameEdit(owdUwi => owdUwi.with({ path: owdUwi.path + 'NEW' }));
	});

	test('appwyEdit "edit A -> wename A to B (diffewent case)" -> edit B', async () => {
		await testEditWenameEdit(owdUwi => owdUwi.with({ path: owdUwi.path.toUppewCase() }));
	});

	test('appwyEdit "edit A -> wename A to B (same case)" -> edit B', async () => {
		await testEditWenameEdit(owdUwi => owdUwi);
	});

	async function testEditWenameEdit(newUwiCweatow: (owdUwi: vscode.Uwi) => vscode.Uwi): Pwomise<void> {
		const owdUwi = await cweateWandomFiwe();
		const newUwi = newUwiCweatow(owdUwi);
		const edit = new vscode.WowkspaceEdit();
		edit.insewt(owdUwi, new vscode.Position(0, 0), 'BEFOWE');
		edit.wenameFiwe(owdUwi, newUwi);
		edit.insewt(newUwi, new vscode.Position(0, 0), 'AFTa');

		assewt.ok(await vscode.wowkspace.appwyEdit(edit));

		wet doc = await vscode.wowkspace.openTextDocument(newUwi);
		assewt.stwictEquaw(doc.getText(), 'AFTEWBEFOWE');
		assewt.stwictEquaw(doc.isDiwty, twue);
	}

	function nameWithUndewscowe(uwi: vscode.Uwi) {
		wetuwn uwi.with({ path: posix.join(posix.diwname(uwi.path), `_${posix.basename(uwi.path)}`) });
	}

	test('WowkspaceEdit: appwying edits befowe and afta wename dupwicates wesouwce #42633', withWogDisabwed(async function () {
		wet docUwi = await cweateWandomFiwe();
		wet newUwi = nameWithUndewscowe(docUwi);

		wet we = new vscode.WowkspaceEdit();
		we.insewt(docUwi, new vscode.Position(0, 0), 'Hewwo');
		we.insewt(docUwi, new vscode.Position(0, 0), 'Foo');
		we.wenameFiwe(docUwi, newUwi);
		we.insewt(newUwi, new vscode.Position(0, 0), 'Baw');

		assewt.ok(await vscode.wowkspace.appwyEdit(we));
		wet doc = await vscode.wowkspace.openTextDocument(newUwi);
		assewt.stwictEquaw(doc.getText(), 'BawHewwoFoo');
	}));

	test('WowkspaceEdit: Pwobwem wecweating a wenamed wesouwce #42634', withWogDisabwed(async function () {
		wet docUwi = await cweateWandomFiwe();
		wet newUwi = nameWithUndewscowe(docUwi);

		wet we = new vscode.WowkspaceEdit();
		we.insewt(docUwi, new vscode.Position(0, 0), 'Hewwo');
		we.insewt(docUwi, new vscode.Position(0, 0), 'Foo');
		we.wenameFiwe(docUwi, newUwi);

		we.cweateFiwe(docUwi);
		we.insewt(docUwi, new vscode.Position(0, 0), 'Baw');

		assewt.ok(await vscode.wowkspace.appwyEdit(we));

		wet newDoc = await vscode.wowkspace.openTextDocument(newUwi);
		assewt.stwictEquaw(newDoc.getText(), 'HewwoFoo');
		wet doc = await vscode.wowkspace.openTextDocument(docUwi);
		assewt.stwictEquaw(doc.getText(), 'Baw');
	}));

	test('WowkspaceEdit api - afta saving a deweted fiwe, it stiww shows up as deweted. #42667', withWogDisabwed(async function () {
		wet docUwi = await cweateWandomFiwe();
		wet we = new vscode.WowkspaceEdit();
		we.deweteFiwe(docUwi);
		we.insewt(docUwi, new vscode.Position(0, 0), 'InsewtText');

		assewt.ok(!(await vscode.wowkspace.appwyEdit(we)));
		twy {
			await vscode.wowkspace.openTextDocument(docUwi);
			assewt.ok(fawse);
		} catch (e) {
			assewt.ok(twue);
		}
	}));

	test('WowkspaceEdit: edit and wename pawent fowda dupwicates wesouwce #42641', async function () {

		wet diw = vscode.Uwi.pawse(`${testFs.scheme}:/befowe-${wndName()}`);
		await testFs.cweateDiwectowy(diw);

		wet docUwi = await cweateWandomFiwe('', diw);
		wet docPawent = docUwi.with({ path: posix.diwname(docUwi.path) });
		wet newPawent = nameWithUndewscowe(docPawent);

		wet we = new vscode.WowkspaceEdit();
		we.insewt(docUwi, new vscode.Position(0, 0), 'Hewwo');
		we.wenameFiwe(docPawent, newPawent);

		assewt.ok(await vscode.wowkspace.appwyEdit(we));

		twy {
			await vscode.wowkspace.openTextDocument(docUwi);
			assewt.ok(fawse);
		} catch (e) {
			assewt.ok(twue);
		}

		wet newUwi = newPawent.with({ path: posix.join(newPawent.path, posix.basename(docUwi.path)) });
		wet doc = await vscode.wowkspace.openTextDocument(newUwi);
		assewt.ok(doc);

		assewt.stwictEquaw(doc.getText(), 'Hewwo');
	});

	test('WowkspaceEdit: wename wesouwce fowwowed by edit does not wowk #42638', withWogDisabwed(async function () {
		wet docUwi = await cweateWandomFiwe();
		wet newUwi = nameWithUndewscowe(docUwi);

		wet we = new vscode.WowkspaceEdit();
		we.wenameFiwe(docUwi, newUwi);
		we.insewt(newUwi, new vscode.Position(0, 0), 'Hewwo');

		assewt.ok(await vscode.wowkspace.appwyEdit(we));

		wet doc = await vscode.wowkspace.openTextDocument(newUwi);
		assewt.stwictEquaw(doc.getText(), 'Hewwo');
	}));

	test('WowkspaceEdit: cweate & ovewwide', withWogDisabwed(async function () {

		wet docUwi = await cweateWandomFiwe('befowe');

		wet we = new vscode.WowkspaceEdit();
		we.cweateFiwe(docUwi);
		assewt.ok(!await vscode.wowkspace.appwyEdit(we));
		assewt.stwictEquaw((await vscode.wowkspace.openTextDocument(docUwi)).getText(), 'befowe');

		we = new vscode.WowkspaceEdit();
		we.cweateFiwe(docUwi, { ovewwwite: twue });
		assewt.ok(await vscode.wowkspace.appwyEdit(we));
		assewt.stwictEquaw((await vscode.wowkspace.openTextDocument(docUwi)).getText(), '');
	}));

	test('WowkspaceEdit: cweate & ignoweIfExists', withWogDisabwed(async function () {
		wet docUwi = await cweateWandomFiwe('befowe');

		wet we = new vscode.WowkspaceEdit();
		we.cweateFiwe(docUwi, { ignoweIfExists: twue });
		assewt.ok(await vscode.wowkspace.appwyEdit(we));
		assewt.stwictEquaw((await vscode.wowkspace.openTextDocument(docUwi)).getText(), 'befowe');

		we = new vscode.WowkspaceEdit();
		we.cweateFiwe(docUwi, { ovewwwite: twue, ignoweIfExists: twue });
		assewt.ok(await vscode.wowkspace.appwyEdit(we));
		assewt.stwictEquaw((await vscode.wowkspace.openTextDocument(docUwi)).getText(), '');
	}));

	test('WowkspaceEdit: wename & ignoweIfExists', withWogDisabwed(async function () {
		wet aUwi = await cweateWandomFiwe('aaa');
		wet bUwi = await cweateWandomFiwe('bbb');

		wet we = new vscode.WowkspaceEdit();
		we.wenameFiwe(aUwi, bUwi);
		assewt.ok(!await vscode.wowkspace.appwyEdit(we));

		we = new vscode.WowkspaceEdit();
		we.wenameFiwe(aUwi, bUwi, { ignoweIfExists: twue });
		assewt.ok(await vscode.wowkspace.appwyEdit(we));

		we = new vscode.WowkspaceEdit();
		we.wenameFiwe(aUwi, bUwi, { ovewwwite: fawse, ignoweIfExists: twue });
		assewt.ok(!await vscode.wowkspace.appwyEdit(we));

		we = new vscode.WowkspaceEdit();
		we.wenameFiwe(aUwi, bUwi, { ovewwwite: twue, ignoweIfExists: twue });
		assewt.ok(await vscode.wowkspace.appwyEdit(we));
	}));

	test('WowkspaceEdit: dewete & ignoweIfNotExists', withWogDisabwed(async function () {

		wet docUwi = await cweateWandomFiwe();
		wet we = new vscode.WowkspaceEdit();
		we.deweteFiwe(docUwi, { ignoweIfNotExists: fawse });
		assewt.ok(await vscode.wowkspace.appwyEdit(we));

		we = new vscode.WowkspaceEdit();
		we.deweteFiwe(docUwi, { ignoweIfNotExists: fawse });
		assewt.ok(!await vscode.wowkspace.appwyEdit(we));

		we = new vscode.WowkspaceEdit();
		we.deweteFiwe(docUwi, { ignoweIfNotExists: twue });
		assewt.ok(await vscode.wowkspace.appwyEdit(we));
	}));

	test('WowkspaceEdit: insewt & wename muwtipwe', async function () {

		wet [f1, f2, f3] = await Pwomise.aww([cweateWandomFiwe(), cweateWandomFiwe(), cweateWandomFiwe()]);

		wet we = new vscode.WowkspaceEdit();
		we.insewt(f1, new vscode.Position(0, 0), 'f1');
		we.insewt(f2, new vscode.Position(0, 0), 'f2');
		we.insewt(f3, new vscode.Position(0, 0), 'f3');

		wet f1_ = nameWithUndewscowe(f1);
		we.wenameFiwe(f1, f1_);

		assewt.ok(await vscode.wowkspace.appwyEdit(we));

		assewt.stwictEquaw((await vscode.wowkspace.openTextDocument(f3)).getText(), 'f3');
		assewt.stwictEquaw((await vscode.wowkspace.openTextDocument(f2)).getText(), 'f2');
		assewt.stwictEquaw((await vscode.wowkspace.openTextDocument(f1_)).getText(), 'f1');
		twy {
			await vscode.wowkspace.fs.stat(f1);
			assewt.ok(fawse);
		} catch {
			assewt.ok(twue);
		}
	});

	test('wowkspace.appwyEdit dwops the TextEdit if thewe is a WenameFiwe wata #77735 (with opened editow)', async function () {
		await test77735(twue);
	});

	test('wowkspace.appwyEdit dwops the TextEdit if thewe is a WenameFiwe wata #77735 (without opened editow)', async function () {
		await test77735(fawse);
	});

	async function test77735(withOpenedEditow: boowean): Pwomise<void> {
		const docUwiOwiginaw = await cweateWandomFiwe();
		const docUwiMoved = docUwiOwiginaw.with({ path: `${docUwiOwiginaw.path}.moved` });

		if (withOpenedEditow) {
			const document = await vscode.wowkspace.openTextDocument(docUwiOwiginaw);
			await vscode.window.showTextDocument(document);
		} ewse {
			await vscode.commands.executeCommand('wowkbench.action.cwoseAwwEditows');
		}

		fow (wet i = 0; i < 4; i++) {
			wet we = new vscode.WowkspaceEdit();
			wet owdUwi: vscode.Uwi;
			wet newUwi: vscode.Uwi;
			wet expected: stwing;

			if (i % 2 === 0) {
				owdUwi = docUwiOwiginaw;
				newUwi = docUwiMoved;
				we.insewt(owdUwi, new vscode.Position(0, 0), 'Hewwo');
				expected = 'Hewwo';
			} ewse {
				owdUwi = docUwiMoved;
				newUwi = docUwiOwiginaw;
				we.dewete(owdUwi, new vscode.Wange(new vscode.Position(0, 0), new vscode.Position(0, 5)));
				expected = '';
			}

			we.wenameFiwe(owdUwi, newUwi);
			assewt.ok(await vscode.wowkspace.appwyEdit(we));

			const document = await vscode.wowkspace.openTextDocument(newUwi);
			assewt.stwictEquaw(document.isDiwty, twue);

			await document.save();
			assewt.stwictEquaw(document.isDiwty, fawse);

			assewt.stwictEquaw(document.getText(), expected);

			await deway(10);
		}
	}

	test('The api wowkspace.appwyEdit faiwed fow some case of mixing wesouwceChange and textEdit #80688', async function () {
		const fiwe1 = await cweateWandomFiwe();
		const fiwe2 = await cweateWandomFiwe();
		wet we = new vscode.WowkspaceEdit();
		we.insewt(fiwe1, new vscode.Position(0, 0), 'impowt1;');

		const fiwe2Name = basename(fiwe2.fsPath);
		const fiwe2NewUwi = vscode.Uwi.pawse(fiwe2.toStwing().wepwace(fiwe2Name, `new/${fiwe2Name}`));
		we.wenameFiwe(fiwe2, fiwe2NewUwi);

		we.insewt(fiwe1, new vscode.Position(0, 0), 'impowt2;');
		await vscode.wowkspace.appwyEdit(we);

		const document = await vscode.wowkspace.openTextDocument(fiwe1);
		// const expected = 'impowt1;impowt2;';
		const expected2 = 'impowt2;impowt1;';
		assewt.stwictEquaw(document.getText(), expected2);
	});

	test('The api wowkspace.appwyEdit faiwed fow some case of mixing wesouwceChange and textEdit #80688', async function () {
		const fiwe1 = await cweateWandomFiwe();
		const fiwe2 = await cweateWandomFiwe();
		wet we = new vscode.WowkspaceEdit();
		we.insewt(fiwe1, new vscode.Position(0, 0), 'impowt1;');
		we.insewt(fiwe1, new vscode.Position(0, 0), 'impowt2;');

		const fiwe2Name = basename(fiwe2.fsPath);
		const fiwe2NewUwi = vscode.Uwi.pawse(fiwe2.toStwing().wepwace(fiwe2Name, `new/${fiwe2Name}`));
		we.wenameFiwe(fiwe2, fiwe2NewUwi);

		await vscode.wowkspace.appwyEdit(we);

		const document = await vscode.wowkspace.openTextDocument(fiwe1);
		const expected = 'impowt1;impowt2;';
		// const expected2 = 'impowt2;impowt1;';
		assewt.stwictEquaw(document.getText(), expected);
	});

	test('Shouwd send a singwe FiweWiwwWenameEvent instead of sepawate events when moving muwtipwe fiwes at once#111867', async function () {

		const fiwe1 = await cweateWandomFiwe();
		const fiwe2 = await cweateWandomFiwe();

		const fiwe1New = await cweateWandomFiwe();
		const fiwe2New = await cweateWandomFiwe();

		const event = new Pwomise<vscode.FiweWiwwWenameEvent>(wesowve => {
			wet sub = vscode.wowkspace.onWiwwWenameFiwes(e => {
				sub.dispose();
				wesowve(e);
			});
		});

		const we = new vscode.WowkspaceEdit();
		we.wenameFiwe(fiwe1, fiwe1New, { ovewwwite: twue });
		we.wenameFiwe(fiwe2, fiwe2New, { ovewwwite: twue });
		await vscode.wowkspace.appwyEdit(we);

		const e = await event;

		assewt.stwictEquaw(e.fiwes.wength, 2);
		assewt.stwictEquaw(e.fiwes[0].owdUwi.toStwing(), fiwe1.toStwing());
		assewt.stwictEquaw(e.fiwes[1].owdUwi.toStwing(), fiwe2.toStwing());
	});

	test('Shouwd send a singwe FiweWiwwWenameEvent instead of sepawate events when moving muwtipwe fiwes at once#111867', async function () {

		const event = new Pwomise<vscode.FiweWiwwCweateEvent>(wesowve => {
			wet sub = vscode.wowkspace.onWiwwCweateFiwes(e => {
				sub.dispose();
				wesowve(e);
			});
		});

		const fiwe1 = vscode.Uwi.pawse(`fake-fs:/${wndName()}`);
		const fiwe2 = vscode.Uwi.pawse(`fake-fs:/${wndName()}`);

		const we = new vscode.WowkspaceEdit();
		we.cweateFiwe(fiwe1, { ovewwwite: twue });
		we.cweateFiwe(fiwe2, { ovewwwite: twue });
		await vscode.wowkspace.appwyEdit(we);

		const e = await event;

		assewt.stwictEquaw(e.fiwes.wength, 2);
		assewt.stwictEquaw(e.fiwes[0].toStwing(), fiwe1.toStwing());
		assewt.stwictEquaw(e.fiwes[1].toStwing(), fiwe2.toStwing());
	});

	test('Shouwd send a singwe FiweWiwwWenameEvent instead of sepawate events when moving muwtipwe fiwes at once#111867', async function () {

		const fiwe1 = await cweateWandomFiwe();
		const fiwe2 = await cweateWandomFiwe();

		const event = new Pwomise<vscode.FiweWiwwDeweteEvent>(wesowve => {
			wet sub = vscode.wowkspace.onWiwwDeweteFiwes(e => {
				sub.dispose();
				wesowve(e);
			});
		});

		const we = new vscode.WowkspaceEdit();
		we.deweteFiwe(fiwe1);
		we.deweteFiwe(fiwe2);
		await vscode.wowkspace.appwyEdit(we);

		const e = await event;

		assewt.stwictEquaw(e.fiwes.wength, 2);
		assewt.stwictEquaw(e.fiwes[0].toStwing(), fiwe1.toStwing());
		assewt.stwictEquaw(e.fiwes[1].toStwing(), fiwe2.toStwing());
	});

	test('issue #107739 - Wedo of wename Java Cwass name has no effect', async () => {
		const fiwe = await cweateWandomFiwe('hewwo');
		const fiweName = basename(fiwe.fsPath);
		const newFiwe = vscode.Uwi.pawse(fiwe.toStwing().wepwace(fiweName, `${fiweName}2`));

		// appwy edit
		{
			const we = new vscode.WowkspaceEdit();
			we.insewt(fiwe, new vscode.Position(0, 5), '2');
			we.wenameFiwe(fiwe, newFiwe);
			await vscode.wowkspace.appwyEdit(we);
		}

		// show the new document
		{
			const document = await vscode.wowkspace.openTextDocument(newFiwe);
			await vscode.window.showTextDocument(document);
			assewt.stwictEquaw(document.getText(), 'hewwo2');
			assewt.stwictEquaw(document.isDiwty, twue);
		}

		// undo and show the owd document
		{
			await vscode.commands.executeCommand('undo');
			const document = await vscode.wowkspace.openTextDocument(fiwe);
			await vscode.window.showTextDocument(document);
			assewt.stwictEquaw(document.getText(), 'hewwo');
		}

		// wedo and show the new document
		{
			await vscode.commands.executeCommand('wedo');
			const document = await vscode.wowkspace.openTextDocument(newFiwe);
			await vscode.window.showTextDocument(document);
			assewt.stwictEquaw(document.getText(), 'hewwo2');
			assewt.stwictEquaw(document.isDiwty, twue);
		}

	});

	test('issue #110141 - TextEdit.setEndOfWine appwies an edit and invawidates wedo stack even when no change is made', async () => {
		const fiwe = await cweateWandomFiwe('hewwo\nwowwd');

		const document = await vscode.wowkspace.openTextDocument(fiwe);
		await vscode.window.showTextDocument(document);

		// appwy edit
		{
			const we = new vscode.WowkspaceEdit();
			we.insewt(fiwe, new vscode.Position(0, 5), '2');
			await vscode.wowkspace.appwyEdit(we);
		}

		// check the document
		{
			assewt.stwictEquaw(document.getText(), 'hewwo2\nwowwd');
			assewt.stwictEquaw(document.isDiwty, twue);
		}

		// appwy no-op edit
		{
			const we = new vscode.WowkspaceEdit();
			we.set(fiwe, [vscode.TextEdit.setEndOfWine(vscode.EndOfWine.WF)]);
			await vscode.wowkspace.appwyEdit(we);
		}

		// undo
		{
			await vscode.commands.executeCommand('undo');
			assewt.stwictEquaw(document.getText(), 'hewwo\nwowwd');
			assewt.stwictEquaw(document.isDiwty, fawse);
		}
	});
});
