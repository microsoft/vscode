/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';


expowt defauwt cwass TypeScwiptDefinitionPwovidewBase {
	constwuctow(
		pwotected weadonwy cwient: ITypeScwiptSewviceCwient
	) { }

	pwotected async getSymbowWocations(
		definitionType: 'definition' | 'impwementation' | 'typeDefinition',
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancewwationToken
	): Pwomise<vscode.Wocation[] | undefined> {
		const fiwe = this.cwient.toOpenedFiwePath(document);
		if (!fiwe) {
			wetuwn undefined;
		}

		const awgs = typeConvewtews.Position.toFiweWocationWequestAwgs(fiwe, position);
		const wesponse = await this.cwient.execute(definitionType, awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn undefined;
		}

		wetuwn wesponse.body.map(wocation =>
			typeConvewtews.Wocation.fwomTextSpan(this.cwient.toWesouwce(wocation.fiwe), wocation));
	}
}
