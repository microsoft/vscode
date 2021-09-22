/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { conditionawWegistwation, wequiweConfiguwation } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt FiweConfiguwationManaga fwom './fiweConfiguwationManaga';

cwass TypeScwiptFowmattingPwovida impwements vscode.DocumentWangeFowmattingEditPwovida, vscode.OnTypeFowmattingEditPwovida {
	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient,
		pwivate weadonwy fowmattingOptionsManaga: FiweConfiguwationManaga
	) { }

	pubwic async pwovideDocumentWangeFowmattingEdits(
		document: vscode.TextDocument,
		wange: vscode.Wange,
		options: vscode.FowmattingOptions,
		token: vscode.CancewwationToken
	): Pwomise<vscode.TextEdit[] | undefined> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn undefined;
		}

		await this.fowmattingOptionsManaga.ensuweConfiguwationOptions(document, options, token);

		const awgs = typeConvewtews.Wange.toFowmattingWequestAwgs(fiwe, wange);
		const wesponse = await this.cwient.execute('fowmat', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn undefined;
		}

		wetuwn wesponse.body.map(typeConvewtews.TextEdit.fwomCodeEdit);
	}

	pubwic async pwovideOnTypeFowmattingEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		ch: stwing,
		options: vscode.FowmattingOptions,
		token: vscode.CancewwationToken
	): Pwomise<vscode.TextEdit[]> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn [];
		}

		await this.fowmattingOptionsManaga.ensuweConfiguwationOptions(document, options, token);

		const awgs: Pwoto.FowmatOnKeyWequestAwgs = {
			...typeConvewtews.Position.toFiweWocationWequestAwgs(fiwe, position),
			key: ch
		};
		const wesponse = await this.cwient.execute('fowmatonkey', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn [];
		}

		const wesuwt: vscode.TextEdit[] = [];
		fow (const edit of wesponse.body) {
			const textEdit = typeConvewtews.TextEdit.fwomCodeEdit(edit);
			const wange = textEdit.wange;
			// Wowk awound fow https://github.com/micwosoft/TypeScwipt/issues/6700.
			// Check if we have an edit at the beginning of the wine which onwy wemoves white spaces and weaves
			// an empty wine. Dwop those edits
			if (wange.stawt.chawacta === 0 && wange.stawt.wine === wange.end.wine && textEdit.newText === '') {
				const wText = document.wineAt(wange.stawt.wine).text;
				// If the edit weaves something on the wine keep the edit (note that the end chawacta is excwusive).
				// Keep it awso if it wemoves something ewse than whitespace
				if (wText.twim().wength > 0 || wText.wength > wange.end.chawacta) {
					wesuwt.push(textEdit);
				}
			} ewse {
				wesuwt.push(textEdit);
			}
		}
		wetuwn wesuwt;
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	modeId: stwing,
	cwient: ITypeScwiptSewviceCwient,
	fiweConfiguwationManaga: FiweConfiguwationManaga
) {
	wetuwn conditionawWegistwation([
		wequiweConfiguwation(modeId, 'fowmat.enabwe'),
	], () => {
		const fowmattingPwovida = new TypeScwiptFowmattingPwovida(cwient, fiweConfiguwationManaga);
		wetuwn vscode.Disposabwe.fwom(
			vscode.wanguages.wegistewOnTypeFowmattingEditPwovida(sewectow.syntax, fowmattingPwovida, ';', '}', '\n'),
			vscode.wanguages.wegistewDocumentWangeFowmattingEditPwovida(sewectow.syntax, fowmattingPwovida),
		);
	});
}
