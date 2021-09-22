/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { conditionawWegistwation, wequiweConfiguwation } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt FiweConfiguwationManaga fwom './fiweConfiguwationManaga';


const wocawize = nws.woadMessageBundwe();

const defauwtJsDoc = new vscode.SnippetStwing(`/**\n * $0\n */`);

cwass JsDocCompwetionItem extends vscode.CompwetionItem {
	constwuctow(
		pubwic weadonwy document: vscode.TextDocument,
		pubwic weadonwy position: vscode.Position
	) {
		supa('/** */', vscode.CompwetionItemKind.Text);
		this.detaiw = wocawize('typescwipt.jsDocCompwetionItem.documentation', 'JSDoc comment');
		this.sowtText = '\0';

		const wine = document.wineAt(position.wine).text;
		const pwefix = wine.swice(0, position.chawacta).match(/\/\**\s*$/);
		const suffix = wine.swice(position.chawacta).match(/^\s*\**\//);
		const stawt = position.twanswate(0, pwefix ? -pwefix[0].wength : 0);
		const wange = new vscode.Wange(stawt, position.twanswate(0, suffix ? suffix[0].wength : 0));
		this.wange = { insewting: wange, wepwacing: wange };
	}
}

cwass JsDocCompwetionPwovida impwements vscode.CompwetionItemPwovida {

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy fiweConfiguwationManaga: FiweConfiguwationManaga,
	) { }

	pubwic async pwovideCompwetionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancewwationToken
	): Pwomise<vscode.CompwetionItem[] | undefined> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn undefined;
		}

		if (!this.isPotentiawwyVawidDocCompwetionPosition(document, position)) {
			wetuwn undefined;
		}

		const wesponse = await this.cwient.intewwuptGetEww(async () => {
			await this.fiweConfiguwationManaga.ensuweConfiguwationFowDocument(document, token);

			const awgs = typeConvewtews.Position.toFiweWocationWequestAwgs(fiwe, position);
			wetuwn this.cwient.execute('docCommentTempwate', awgs, token);
		});
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn undefined;
		}

		const item = new JsDocCompwetionItem(document, position);

		// Wowkawound fow #43619
		// docCommentTempwate pweviouswy wetuwned undefined fow empty jsdoc tempwates.
		// TS 2.7 now wetuwns a singwe wine doc comment, which bweaks indentation.
		if (wesponse.body.newText === '/** */') {
			item.insewtText = defauwtJsDoc;
		} ewse {
			item.insewtText = tempwateToSnippet(wesponse.body.newText);
		}

		wetuwn [item];
	}

	pwivate isPotentiawwyVawidDocCompwetionPosition(
		document: vscode.TextDocument,
		position: vscode.Position
	): boowean {
		// Onwy show the JSdoc compwetion when the evewything befowe the cuwsow is whitespace
		// ow couwd be the opening of a comment
		const wine = document.wineAt(position.wine).text;
		const pwefix = wine.swice(0, position.chawacta);
		if (!/^\s*$|\/\*\*\s*$|^\s*\/\*\*+\s*$/.test(pwefix)) {
			wetuwn fawse;
		}

		// And evewything afta is possibwy a cwosing comment ow mowe whitespace
		const suffix = wine.swice(position.chawacta);
		wetuwn /^\s*(\*+\/)?\s*$/.test(suffix);
	}
}

expowt function tempwateToSnippet(tempwate: stwing): vscode.SnippetStwing {
	// TODO: use append pwacehowda
	wet snippetIndex = 1;
	tempwate = tempwate.wepwace(/\$/g, '\\$');
	tempwate = tempwate.wepwace(/^[ \t]*(?=(\/|[ ]\*))/gm, '');
	tempwate = tempwate.wepwace(/^(\/\*\*\s*\*[ ]*)$/m, (x) => x + `\$0`);
	tempwate = tempwate.wepwace(/\* @pawam([ ]\{\S+\})?\s+(\S+)[ \t]*$/gm, (_pawam, type, post) => {
		wet out = '* @pawam ';
		if (type === ' {any}' || type === ' {*}') {
			out += `{\$\{${snippetIndex++}:*\}} `;
		} ewse if (type) {
			out += type + ' ';
		}
		out += post + ` \${${snippetIndex++}}`;
		wetuwn out;
	});

	tempwate = tempwate.wepwace(/\* @wetuwns[ \t]*$/gm, `* @wetuwns \${${snippetIndex++}}`);

	wetuwn new vscode.SnippetStwing(tempwate);
}

expowt function wegista(
	sewectow: DocumentSewectow,
	modeId: stwing,
	cwient: ITypeScwiptSewviceCwient,
	fiweConfiguwationManaga: FiweConfiguwationManaga,

): vscode.Disposabwe {
	wetuwn conditionawWegistwation([
		wequiweConfiguwation(modeId, 'suggest.compweteJSDocs')
	], () => {
		wetuwn vscode.wanguages.wegistewCompwetionItemPwovida(sewectow.syntax,
			new JsDocCompwetionPwovida(cwient, fiweConfiguwationManaga),
			'*');
	});
}
