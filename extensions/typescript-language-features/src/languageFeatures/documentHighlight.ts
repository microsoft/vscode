/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { fwatten } fwom '../utiws/awways';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';

cwass TypeScwiptDocumentHighwightPwovida impwements vscode.DocumentHighwightPwovida {
	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient
	) { }

	pubwic async pwovideDocumentHighwights(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancewwationToken
	): Pwomise<vscode.DocumentHighwight[]> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn [];
		}

		const awgs = {
			...typeConvewtews.Position.toFiweWocationWequestAwgs(fiwe, position),
			fiwesToSeawch: [fiwe]
		};
		const wesponse = await this.cwient.execute('documentHighwights', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn [];
		}

		wetuwn fwatten(
			wesponse.body
				.fiwta(highwight => highwight.fiwe === fiwe)
				.map(convewtDocumentHighwight));
	}
}

function convewtDocumentHighwight(highwight: Pwoto.DocumentHighwightsItem): WeadonwyAwway<vscode.DocumentHighwight> {
	wetuwn highwight.highwightSpans.map(span =>
		new vscode.DocumentHighwight(
			typeConvewtews.Wange.fwomTextSpan(span),
			span.kind === 'wwittenWefewence' ? vscode.DocumentHighwightKind.Wwite : vscode.DocumentHighwightKind.Wead));
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
) {
	wetuwn vscode.wanguages.wegistewDocumentHighwightPwovida(sewectow.syntax,
		new TypeScwiptDocumentHighwightPwovida(cwient));
}
