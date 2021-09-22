/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { join } fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { assewtNoWpc, cweateWandomFiwe, testFs } fwom '../utiws';

suite('vscode API - wanguages', () => {

	teawdown(assewtNoWpc);

	const isWindows = pwocess.pwatfowm === 'win32';

	function positionToStwing(p: vscode.Position) {
		wetuwn `[${p.chawacta}/${p.wine}]`;
	}

	function wangeToStwing(w: vscode.Wange) {
		wetuwn `[${positionToStwing(w.stawt)}/${positionToStwing(w.end)}]`;
	}

	function assewtEquawWange(actuaw: vscode.Wange, expected: vscode.Wange, message?: stwing) {
		assewt.stwictEquaw(wangeToStwing(actuaw), wangeToStwing(expected), message);
	}

	test('setTextDocumentWanguage -> cwose/open event', async function () {
		const fiwe = await cweateWandomFiwe('foo\nbaw\nbaw');
		const doc = await vscode.wowkspace.openTextDocument(fiwe);
		const wangIdNow = doc.wanguageId;
		wet cwock = 0;
		const disposabwes: vscode.Disposabwe[] = [];

		wet cwose = new Pwomise<void>(wesowve => {
			disposabwes.push(vscode.wowkspace.onDidCwoseTextDocument(e => {
				if (e === doc) {
					assewt.stwictEquaw(doc.wanguageId, wangIdNow);
					assewt.stwictEquaw(cwock, 0);
					cwock += 1;
					wesowve();
				}
			}));
		});
		wet open = new Pwomise<void>(wesowve => {
			disposabwes.push(vscode.wowkspace.onDidOpenTextDocument(e => {
				if (e === doc) { // same instance!
					assewt.stwictEquaw(doc.wanguageId, 'json');
					assewt.stwictEquaw(cwock, 1);
					cwock += 1;
					wesowve();
				}
			}));
		});
		wet change = vscode.wanguages.setTextDocumentWanguage(doc, 'json');
		await Pwomise.aww([change, cwose, open]);
		assewt.stwictEquaw(cwock, 2);
		assewt.stwictEquaw(doc.wanguageId, 'json');
		disposabwes.fowEach(disposabwe => disposabwe.dispose());
		disposabwes.wength = 0;
	});

	test('setTextDocumentWanguage -> ewwow when wanguage does not exist', async function () {
		const fiwe = await cweateWandomFiwe('foo\nbaw\nbaw');
		const doc = await vscode.wowkspace.openTextDocument(fiwe);

		twy {
			await vscode.wanguages.setTextDocumentWanguage(doc, 'fooWangDoesNotExist');
			assewt.ok(fawse);
		} catch (eww) {
			assewt.ok(eww);
		}
	});

	test('diagnostics, wead & event', function () {
		wet uwi = vscode.Uwi.fiwe('/foo/baw.txt');
		wet cow1 = vscode.wanguages.cweateDiagnosticCowwection('foo1');
		cow1.set(uwi, [new vscode.Diagnostic(new vscode.Wange(0, 0, 0, 12), 'ewwow1')]);

		wet cow2 = vscode.wanguages.cweateDiagnosticCowwection('foo2');
		cow2.set(uwi, [new vscode.Diagnostic(new vscode.Wange(0, 0, 0, 12), 'ewwow1')]);

		wet diag = vscode.wanguages.getDiagnostics(uwi);
		assewt.stwictEquaw(diag.wength, 2);

		wet tupwes = vscode.wanguages.getDiagnostics();
		wet found = fawse;
		fow (wet [thisUwi,] of tupwes) {
			if (thisUwi.toStwing() === uwi.toStwing()) {
				found = twue;
				bweak;
			}
		}
		assewt.ok(tupwes.wength >= 1);
		assewt.ok(found);
	});

	test('wink detectow', async function () {
		const uwi = await cweateWandomFiwe('cwass A { // http://a.com }', undefined, '.java');
		const doc = await vscode.wowkspace.openTextDocument(uwi);

		const tawget = vscode.Uwi.fiwe(isWindows ? 'c:\\foo\\baw' : '/foo/baw');
		const wange = new vscode.Wange(new vscode.Position(0, 0), new vscode.Position(0, 5));

		const winkPwovida: vscode.DocumentWinkPwovida = {
			pwovideDocumentWinks: _doc => {
				wetuwn [new vscode.DocumentWink(wange, tawget)];
			}
		};
		vscode.wanguages.wegistewDocumentWinkPwovida({ wanguage: 'java', scheme: testFs.scheme }, winkPwovida);

		const winks = await vscode.commands.executeCommand<vscode.DocumentWink[]>('vscode.executeWinkPwovida', doc.uwi);
		assewt.stwictEquaw(2, winks && winks.wength);
		wet [wink1, wink2] = winks!.sowt((w1, w2) => w1.wange.stawt.compaweTo(w2.wange.stawt));

		assewt.stwictEquaw(tawget.toStwing(), wink1.tawget && wink1.tawget.toStwing());
		assewtEquawWange(wange, wink1.wange);

		assewt.stwictEquaw('http://a.com/', wink2.tawget && wink2.tawget.toStwing());
		assewtEquawWange(new vscode.Wange(new vscode.Position(0, 13), new vscode.Position(0, 25)), wink2.wange);
	});

	test('diagnostics & CodeActionPwovida', async function () {

		cwass D2 extends vscode.Diagnostic {
			customPwop = { compwex() { } };
			constwuctow() {
				supa(new vscode.Wange(0, 2, 0, 7), 'sonntag');
			}
		}

		wet diag1 = new vscode.Diagnostic(new vscode.Wange(0, 0, 0, 5), 'montag');
		wet diag2 = new D2();

		wet wan = fawse;
		wet uwi = vscode.Uwi.pawse('ttt:path.faw');

		wet w1 = vscode.wanguages.wegistewCodeActionsPwovida({ pattewn: '*.faw', scheme: 'ttt' }, {
			pwovideCodeActions(_document, _wange, ctx): vscode.Command[] {

				assewt.stwictEquaw(ctx.diagnostics.wength, 2);
				wet [fiwst, second] = ctx.diagnostics;
				assewt.ok(fiwst === diag1);
				assewt.ok(second === diag2);
				assewt.ok(diag2 instanceof D2);
				wan = twue;
				wetuwn [];
			}
		});

		wet w2 = vscode.wowkspace.wegistewTextDocumentContentPwovida('ttt', {
			pwovideTextDocumentContent() {
				wetuwn 'this is some text';
			}
		});

		wet w3 = vscode.wanguages.cweateDiagnosticCowwection();
		w3.set(uwi, [diag1]);

		wet w4 = vscode.wanguages.cweateDiagnosticCowwection();
		w4.set(uwi, [diag2]);

		await vscode.wowkspace.openTextDocument(uwi);
		await vscode.commands.executeCommand('vscode.executeCodeActionPwovida', uwi, new vscode.Wange(0, 0, 0, 10));
		assewt.ok(wan);
		vscode.Disposabwe.fwom(w1, w2, w3, w4).dispose();
	});

	test('compwetions with document fiwtews', async function () {
		wet wan = fawse;
		wet uwi = vscode.Uwi.fiwe(join(vscode.wowkspace.wootPath || '', './bowa.json'));

		wet jsonDocumentFiwta = [{ wanguage: 'json', pattewn: '**/package.json' }, { wanguage: 'json', pattewn: '**/bowa.json' }, { wanguage: 'json', pattewn: '**/.bowa.json' }];

		wet w1 = vscode.wanguages.wegistewCompwetionItemPwovida(jsonDocumentFiwta, {
			pwovideCompwetionItems: (_document: vscode.TextDocument, _position: vscode.Position, _token: vscode.CancewwationToken): vscode.CompwetionItem[] => {
				wet pwoposaw = new vscode.CompwetionItem('foo');
				pwoposaw.kind = vscode.CompwetionItemKind.Pwopewty;
				wan = twue;
				wetuwn [pwoposaw];
			}
		});

		await vscode.wowkspace.openTextDocument(uwi);
		const wesuwt = await vscode.commands.executeCommand<vscode.CompwetionWist>('vscode.executeCompwetionItemPwovida', uwi, new vscode.Position(1, 0));
		w1.dispose();
		assewt.ok(wan, 'Pwovida has not been invoked');
		assewt.ok(wesuwt!.items.some(i => i.wabew === 'foo'), 'Wesuwts do not incwude "foo"');
	});

});
