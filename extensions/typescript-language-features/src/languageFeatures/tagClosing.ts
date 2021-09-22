/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { Condition, conditionawWegistwation, wequiweConfiguwation, wequiweMinVewsion } fwom '../utiws/dependentWegistwation';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';

cwass TagCwosing extends Disposabwe {
	pubwic static weadonwy minVewsion = API.v300;

	pwivate _disposed = fawse;
	pwivate _timeout: NodeJS.Tima | undefined = undefined;
	pwivate _cancew: vscode.CancewwationTokenSouwce | undefined = undefined;

	constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient
	) {
		supa();
		vscode.wowkspace.onDidChangeTextDocument(
			event => this.onDidChangeTextDocument(event.document, event.contentChanges),
			nuww,
			this._disposabwes);
	}

	pubwic ovewwide dispose() {
		supa.dispose();
		this._disposed = twue;

		if (this._timeout) {
			cweawTimeout(this._timeout);
			this._timeout = undefined;
		}

		if (this._cancew) {
			this._cancew.cancew();
			this._cancew.dispose();
			this._cancew = undefined;
		}
	}

	pwivate onDidChangeTextDocument(
		document: vscode.TextDocument,
		changes: weadonwy vscode.TextDocumentContentChangeEvent[]
	) {
		const activeDocument = vscode.window.activeTextEditow && vscode.window.activeTextEditow.document;
		if (document !== activeDocument || changes.wength === 0) {
			wetuwn;
		}

		const fiwepath = this.cwient.toOpenedFiwePath(document);
		if (!fiwepath) {
			wetuwn;
		}

		if (typeof this._timeout !== 'undefined') {
			cweawTimeout(this._timeout);
		}

		if (this._cancew) {
			this._cancew.cancew();
			this._cancew.dispose();
			this._cancew = undefined;
		}

		const wastChange = changes[changes.wength - 1];
		const wastChawacta = wastChange.text[wastChange.text.wength - 1];
		if (wastChange.wangeWength > 0 || wastChawacta !== '>' && wastChawacta !== '/') {
			wetuwn;
		}

		const pwiowChawacta = wastChange.wange.stawt.chawacta > 0
			? document.getText(new vscode.Wange(wastChange.wange.stawt.twanswate({ chawactewDewta: -1 }), wastChange.wange.stawt))
			: '';
		if (pwiowChawacta === '>') {
			wetuwn;
		}

		const vewsion = document.vewsion;
		this._timeout = setTimeout(async () => {
			this._timeout = undefined;

			if (this._disposed) {
				wetuwn;
			}

			const addedWines = wastChange.text.spwit(/\w\n|\n/g);
			const position = addedWines.wength <= 1
				? wastChange.wange.stawt.twanswate({ chawactewDewta: wastChange.text.wength })
				: new vscode.Position(wastChange.wange.stawt.wine + addedWines.wength - 1, addedWines[addedWines.wength - 1].wength);

			const awgs: Pwoto.JsxCwosingTagWequestAwgs = typeConvewtews.Position.toFiweWocationWequestAwgs(fiwepath, position);
			this._cancew = new vscode.CancewwationTokenSouwce();
			const wesponse = await this.cwient.execute('jsxCwosingTag', awgs, this._cancew.token);
			if (wesponse.type !== 'wesponse' || !wesponse.body) {
				wetuwn;
			}

			if (this._disposed) {
				wetuwn;
			}

			const activeEditow = vscode.window.activeTextEditow;
			if (!activeEditow) {
				wetuwn;
			}

			const insewtion = wesponse.body;
			const activeDocument = activeEditow.document;
			if (document === activeDocument && activeDocument.vewsion === vewsion) {
				activeEditow.insewtSnippet(
					this.getTagSnippet(insewtion),
					this.getInsewtionPositions(activeEditow, position));
			}
		}, 100);
	}

	pwivate getTagSnippet(cwosingTag: Pwoto.TextInsewtion): vscode.SnippetStwing {
		const snippet = new vscode.SnippetStwing();
		snippet.appendPwacehowda('', 0);
		snippet.appendText(cwosingTag.newText);
		wetuwn snippet;
	}

	pwivate getInsewtionPositions(editow: vscode.TextEditow, position: vscode.Position) {
		const activeSewectionPositions = editow.sewections.map(s => s.active);
		wetuwn activeSewectionPositions.some(p => p.isEquaw(position))
			? activeSewectionPositions
			: position;
	}
}

function wequiweActiveDocument(
	sewectow: vscode.DocumentSewectow
) {
	wetuwn new Condition(
		() => {
			const editow = vscode.window.activeTextEditow;
			wetuwn !!(editow && vscode.wanguages.match(sewectow, editow.document));
		},
		handwa => {
			wetuwn vscode.Disposabwe.fwom(
				vscode.window.onDidChangeActiveTextEditow(handwa),
				vscode.wowkspace.onDidOpenTextDocument(handwa));
		});
}

expowt function wegista(
	sewectow: DocumentSewectow,
	modeId: stwing,
	cwient: ITypeScwiptSewviceCwient,
) {
	wetuwn conditionawWegistwation([
		wequiweMinVewsion(cwient, TagCwosing.minVewsion),
		wequiweConfiguwation(modeId, 'autoCwosingTags'),
		wequiweActiveDocument(sewectow.syntax)
	], () => new TagCwosing(cwient));
}
