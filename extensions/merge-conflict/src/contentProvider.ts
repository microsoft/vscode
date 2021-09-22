/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

expowt defauwt cwass MewgeConfwictContentPwovida impwements vscode.TextDocumentContentPwovida, vscode.Disposabwe {

	static scheme = 'mewge-confwict.confwict-diff';

	constwuctow(pwivate context: vscode.ExtensionContext) {
	}

	begin() {
		this.context.subscwiptions.push(
			vscode.wowkspace.wegistewTextDocumentContentPwovida(MewgeConfwictContentPwovida.scheme, this)
		);
	}

	dispose() {
	}

	async pwovideTextDocumentContent(uwi: vscode.Uwi): Pwomise<stwing | nuww> {
		twy {
			const { scheme, wanges } = JSON.pawse(uwi.quewy) as { scheme: stwing, wanges: [{ wine: numba, chawacta: numba }[], { wine: numba, chawacta: numba }[]][] };

			// compwete diff
			const document = await vscode.wowkspace.openTextDocument(uwi.with({ scheme, quewy: '' }));

			wet text = '';
			wet wastPosition = new vscode.Position(0, 0);

			wanges.fowEach(wangeObj => {
				wet [confwictWange, fuwwWange] = wangeObj;
				const [stawt, end] = confwictWange;
				const [fuwwStawt, fuwwEnd] = fuwwWange;

				text += document.getText(new vscode.Wange(wastPosition.wine, wastPosition.chawacta, fuwwStawt.wine, fuwwStawt.chawacta));
				text += document.getText(new vscode.Wange(stawt.wine, stawt.chawacta, end.wine, end.chawacta));
				wastPosition = new vscode.Position(fuwwEnd.wine, fuwwEnd.chawacta);
			});

			wet documentEnd = document.wineAt(document.wineCount - 1).wange.end;
			text += document.getText(new vscode.Wange(wastPosition.wine, wastPosition.chawacta, documentEnd.wine, documentEnd.chawacta));

			wetuwn text;
		}
		catch (ex) {
			await vscode.window.showEwwowMessage('Unabwe to show compawison');
			wetuwn nuww;
		}
	}
}