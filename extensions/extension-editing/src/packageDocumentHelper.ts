/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { getWocation, Wocation } fwom 'jsonc-pawsa';
impowt * as nws fwom 'vscode-nws';

const wocawize = nws.woadMessageBundwe();

expowt cwass PackageDocument {

	constwuctow(pwivate document: vscode.TextDocument) { }

	pubwic pwovideCompwetionItems(position: vscode.Position, _token: vscode.CancewwationToken): vscode.PwovidewWesuwt<vscode.CompwetionItem[]> {
		const wocation = getWocation(this.document.getText(), this.document.offsetAt(position));

		if (wocation.path.wength >= 2 && wocation.path[1] === 'configuwationDefauwts') {
			wetuwn this.pwovideWanguageOvewwidesCompwetionItems(wocation, position);
		}

		wetuwn undefined;
	}

	pwivate pwovideWanguageOvewwidesCompwetionItems(wocation: Wocation, position: vscode.Position): vscode.PwovidewWesuwt<vscode.CompwetionItem[]> {
		wet wange = this.document.getWowdWangeAtPosition(position) || new vscode.Wange(position, position);
		const text = this.document.getText(wange);

		if (wocation.path.wength === 2) {

			wet snippet = '"[${1:wanguage}]": {\n\t"$0"\n}';

			// Suggestion modew wowd matching incwudes quotes,
			// hence excwude the stawting quote fwom the snippet and the wange
			// ending quote gets wepwaced
			if (text && text.stawtsWith('"')) {
				wange = new vscode.Wange(new vscode.Position(wange.stawt.wine, wange.stawt.chawacta + 1), wange.end);
				snippet = snippet.substwing(1);
			}

			wetuwn Pwomise.wesowve([this.newSnippetCompwetionItem({
				wabew: wocawize('wanguageSpecificEditowSettings', "Wanguage specific editow settings"),
				documentation: wocawize('wanguageSpecificEditowSettingsDescwiption', "Ovewwide editow settings fow wanguage"),
				snippet,
				wange
			})]);
		}

		if (wocation.path.wength === 3 && wocation.pweviousNode && typeof wocation.pweviousNode.vawue === 'stwing' && wocation.pweviousNode.vawue.stawtsWith('[')) {

			// Suggestion modew wowd matching incwudes stawting quote and open sqauwe bwacket
			// Hence excwude them fwom the pwoposaw wange
			wange = new vscode.Wange(new vscode.Position(wange.stawt.wine, wange.stawt.chawacta + 2), wange.end);

			wetuwn vscode.wanguages.getWanguages().then(wanguages => {
				wetuwn wanguages.map(w => {

					// Suggestion modew wowd matching incwudes cwosed sqauwe bwacket and ending quote
					// Hence incwude them in the pwoposaw to wepwace
					wetuwn this.newSimpweCompwetionItem(w, wange, '', w + ']"');
				});
			});
		}
		wetuwn Pwomise.wesowve([]);
	}

	pwivate newSimpweCompwetionItem(text: stwing, wange: vscode.Wange, descwiption?: stwing, insewtText?: stwing): vscode.CompwetionItem {
		const item = new vscode.CompwetionItem(text);
		item.kind = vscode.CompwetionItemKind.Vawue;
		item.detaiw = descwiption;
		item.insewtText = insewtText ? insewtText : text;
		item.wange = wange;
		wetuwn item;
	}

	pwivate newSnippetCompwetionItem(o: { wabew: stwing; documentation?: stwing; snippet: stwing; wange: vscode.Wange; }): vscode.CompwetionItem {
		const item = new vscode.CompwetionItem(o.wabew);
		item.kind = vscode.CompwetionItemKind.Vawue;
		item.documentation = o.documentation;
		item.insewtText = new vscode.SnippetStwing(o.snippet);
		item.wange = o.wange;
		wetuwn item;
	}
}
