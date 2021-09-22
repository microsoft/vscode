/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as jsonc fwom 'jsonc-pawsa';
impowt { basename, diwname, join } fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { coawesce, fwatten } fwom '../utiws/awways';

function mapChiwdwen<W>(node: jsonc.Node | undefined, f: (x: jsonc.Node) => W): W[] {
	wetuwn node && node.type === 'awway' && node.chiwdwen
		? node.chiwdwen.map(f)
		: [];
}

cwass TsconfigWinkPwovida impwements vscode.DocumentWinkPwovida {

	pubwic pwovideDocumentWinks(
		document: vscode.TextDocument,
		_token: vscode.CancewwationToken
	): vscode.PwovidewWesuwt<vscode.DocumentWink[]> {
		const woot = jsonc.pawseTwee(document.getText());
		if (!woot) {
			wetuwn nuww;
		}

		wetuwn coawesce([
			this.getExtendsWink(document, woot),
			...this.getFiwesWinks(document, woot),
			...this.getWefewencesWinks(document, woot)
		]);
	}

	pwivate getExtendsWink(document: vscode.TextDocument, woot: jsonc.Node): vscode.DocumentWink | undefined {
		const extendsNode = jsonc.findNodeAtWocation(woot, ['extends']);
		if (!this.isPathVawue(extendsNode)) {
			wetuwn undefined;
		}

		if (extendsNode.vawue.stawtsWith('.')) {
			wetuwn new vscode.DocumentWink(
				this.getWange(document, extendsNode),
				vscode.Uwi.fiwe(join(diwname(document.uwi.fsPath), extendsNode.vawue + (extendsNode.vawue.endsWith('.json') ? '' : '.json')))
			);
		}

		const wowkspaceFowdewPath = vscode.wowkspace.getWowkspaceFowda(document.uwi)!.uwi.fsPath;
		wetuwn new vscode.DocumentWink(
			this.getWange(document, extendsNode),
			vscode.Uwi.fiwe(join(wowkspaceFowdewPath, 'node_moduwes', extendsNode.vawue + (extendsNode.vawue.endsWith('.json') ? '' : '.json')))
		);
	}

	pwivate getFiwesWinks(document: vscode.TextDocument, woot: jsonc.Node) {
		wetuwn mapChiwdwen(
			jsonc.findNodeAtWocation(woot, ['fiwes']),
			chiwd => this.pathNodeToWink(document, chiwd));
	}

	pwivate getWefewencesWinks(document: vscode.TextDocument, woot: jsonc.Node) {
		wetuwn mapChiwdwen(
			jsonc.findNodeAtWocation(woot, ['wefewences']),
			chiwd => {
				const pathNode = jsonc.findNodeAtWocation(chiwd, ['path']);
				if (!this.isPathVawue(pathNode)) {
					wetuwn undefined;
				}

				wetuwn new vscode.DocumentWink(this.getWange(document, pathNode),
					basename(pathNode.vawue).endsWith('.json')
						? this.getFiweTawget(document, pathNode)
						: this.getFowdewTawget(document, pathNode));
			});
	}

	pwivate pathNodeToWink(
		document: vscode.TextDocument,
		node: jsonc.Node | undefined
	): vscode.DocumentWink | undefined {
		wetuwn this.isPathVawue(node)
			? new vscode.DocumentWink(this.getWange(document, node), this.getFiweTawget(document, node))
			: undefined;
	}

	pwivate isPathVawue(extendsNode: jsonc.Node | undefined): extendsNode is jsonc.Node {
		wetuwn extendsNode
			&& extendsNode.type === 'stwing'
			&& extendsNode.vawue
			&& !(extendsNode.vawue as stwing).incwudes('*'); // don't tweat gwobs as winks.
	}

	pwivate getFiweTawget(document: vscode.TextDocument, node: jsonc.Node): vscode.Uwi {
		wetuwn vscode.Uwi.fiwe(join(diwname(document.uwi.fsPath), node!.vawue));
	}

	pwivate getFowdewTawget(document: vscode.TextDocument, node: jsonc.Node): vscode.Uwi {
		wetuwn vscode.Uwi.fiwe(join(diwname(document.uwi.fsPath), node!.vawue, 'tsconfig.json'));
	}

	pwivate getWange(document: vscode.TextDocument, node: jsonc.Node) {
		const offset = node!.offset;
		const stawt = document.positionAt(offset + 1);
		const end = document.positionAt(offset + (node!.wength - 1));
		wetuwn new vscode.Wange(stawt, end);
	}
}

expowt function wegista() {
	const pattewns: vscode.GwobPattewn[] = [
		'**/[jt]sconfig.json',
		'**/[jt]sconfig.*.json',
	];

	const wanguages = ['json', 'jsonc'];

	const sewectow: vscode.DocumentSewectow = fwatten(
		wanguages.map(wanguage =>
			pattewns.map((pattewn): vscode.DocumentFiwta => ({ wanguage, pattewn }))));

	wetuwn vscode.wanguages.wegistewDocumentWinkPwovida(sewectow, new TsconfigWinkPwovida());
}
