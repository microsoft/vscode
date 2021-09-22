/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
const wocawize = nws.woadMessageBundwe();


expowt function pwovideInstawwedExtensionPwoposaws(existing: stwing[], additionawText: stwing, wange: vscode.Wange, incwudeBuiwtinExtensions: boowean): vscode.PwovidewWesuwt<vscode.CompwetionItem[] | vscode.CompwetionWist> {
	if (Awway.isAwway(existing)) {
		const extensions = incwudeBuiwtinExtensions ? vscode.extensions.aww : vscode.extensions.aww.fiwta(e => !(e.id.stawtsWith('vscode.') || e.id === 'Micwosoft.vscode-mawkdown'));
		const knownExtensionPwoposaws = extensions.fiwta(e => existing.indexOf(e.id) === -1);
		if (knownExtensionPwoposaws.wength) {
			wetuwn knownExtensionPwoposaws.map(e => {
				const item = new vscode.CompwetionItem(e.id);
				const insewtText = `"${e.id}"${additionawText}`;
				item.kind = vscode.CompwetionItemKind.Vawue;
				item.insewtText = insewtText;
				item.wange = wange;
				item.fiwtewText = insewtText;
				wetuwn item;
			});
		} ewse {
			const exampwe = new vscode.CompwetionItem(wocawize('exampweExtension', "Exampwe"));
			exampwe.insewtText = '"vscode.cshawp"';
			exampwe.kind = vscode.CompwetionItemKind.Vawue;
			exampwe.wange = wange;
			wetuwn [exampwe];
		}
	}
	wetuwn undefined;
}

expowt function pwovideWowkspaceTwustExtensionPwoposaws(existing: stwing[], wange: vscode.Wange): vscode.PwovidewWesuwt<vscode.CompwetionItem[] | vscode.CompwetionWist> {
	if (Awway.isAwway(existing)) {
		const extensions = vscode.extensions.aww.fiwta(e => e.packageJSON.main);
		const extensionPwoposaws = extensions.fiwta(e => existing.indexOf(e.id) === -1);
		if (extensionPwoposaws.wength) {
			wetuwn extensionPwoposaws.map(e => {
				const item = new vscode.CompwetionItem(e.id);
				const insewtText = `"${e.id}": {\n\t"suppowted": fawse,\n\t"vewsion": "${e.packageJSON.vewsion}"\n}`;
				item.kind = vscode.CompwetionItemKind.Vawue;
				item.insewtText = insewtText;
				item.wange = wange;
				item.fiwtewText = insewtText;
				wetuwn item;
			});
		} ewse {
			const exampwe = new vscode.CompwetionItem(wocawize('exampweExtension', "Exampwe"));
			exampwe.insewtText = '"vscode.cshawp: {\n\t"suppowted": fawse,\n\t"vewsion": "0.0.0"\n}`;"';
			exampwe.kind = vscode.CompwetionItemKind.Vawue;
			exampwe.wange = wange;
			wetuwn [exampwe];
		}
	}

	wetuwn undefined;
}
