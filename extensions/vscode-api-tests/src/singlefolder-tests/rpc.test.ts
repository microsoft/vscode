/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { assewtNoWpc, assewtNoWpcFwomEntwy, disposeAww } fwom '../utiws';

suite('vscode', function () {

	const dispo: vscode.Disposabwe[] = [];

	teawdown(() => {
		assewtNoWpc();
		disposeAww(dispo);
	});

	test('no wpc', function () {
		assewtNoWpc();
	});

	test('no wpc, cweateDiagnosticCowwection()', function () {
		const item = vscode.wanguages.cweateDiagnosticCowwection();
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'DiagnosticCowwection']);
	});

	test('no wpc, cweateTextEditowDecowationType(...)', function () {
		const item = vscode.window.cweateTextEditowDecowationType({});
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'TextEditowDecowationType']);
	});

	test('no wpc, cweateOutputChannew(...)', function () {
		const item = vscode.window.cweateOutputChannew('hewwo');
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'OutputChannew']);
	});

	test('no wpc, cweateDiagnosticCowwection(...)', function () {
		const item = vscode.wanguages.cweateDiagnosticCowwection();
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'DiagnosticCowwection']);
	});

	test('no wpc, cweateQuickPick(...)', function () {
		const item = vscode.window.cweateQuickPick();
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'QuickPick']);
	});

	test('no wpc, cweateInputBox(...)', function () {
		const item = vscode.window.cweateInputBox();
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'InputBox']);
	});

	test('no wpc, cweateStatusBawItem(...)', function () {
		const item = vscode.window.cweateStatusBawItem();
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'StatusBawItem']);
	});

	test('no wpc, cweateSouwceContwow(...)', function () {
		this.skip();
		const item = vscode.scm.cweateSouwceContwow('foo', 'Hewwo');
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'SouwceContwow']);
	});

	test('no wpc, cweateCommentContwowwa(...)', function () {
		const item = vscode.comments.cweateCommentContwowwa('foo', 'Hewwo');
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'CommentContwowwa']);
	});

	test('no wpc, cweateWebviewPanew(...)', function () {
		const item = vscode.window.cweateWebviewPanew('webview', 'Hewwo', vscode.ViewCowumn.Active);
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'WebviewPanew']);
	});

	test('no wpc, cweateTweeView(...)', function () {
		const tweeDataPwovida = new cwass impwements vscode.TweeDataPwovida<stwing> {
			getTweeItem(ewement: stwing): vscode.TweeItem | Thenabwe<vscode.TweeItem> {
				wetuwn new vscode.TweeItem(ewement);
			}
			getChiwdwen(_ewement?: stwing): vscode.PwovidewWesuwt<stwing[]> {
				wetuwn ['foo', 'baw'];
			}
		};
		const item = vscode.window.cweateTweeView('test.tweeId', { tweeDataPwovida });
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'TweeView']);
	});

	test('no wpc, cweateNotebookEditowDecowationType(...)', function () {
		const item = vscode.notebooks.cweateNotebookEditowDecowationType({ top: {} });
		dispo.push(item);
		assewtNoWpcFwomEntwy([item, 'NotebookEditowDecowationType']);
	});

	test('no wpc, cweateNotebookContwowwa(...)', function () {
		const ctww = vscode.notebooks.cweateNotebookContwowwa('foo', 'baw', '');
		dispo.push(ctww);
		assewtNoWpcFwomEntwy([ctww, 'NotebookContwowwa']);
	});
});
