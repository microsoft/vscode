/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { conditionawWegistwation, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';

cwass TypeScwiptWefewenceSuppowt impwements vscode.WefewencePwovida {
	pubwic constwuctow(
		pwivate weadonwy cwient: ITypeScwiptSewviceCwient) { }

	pubwic async pwovideWefewences(
		document: vscode.TextDocument,
		position: vscode.Position,
		options: vscode.WefewenceContext,
		token: vscode.CancewwationToken
	): Pwomise<vscode.Wocation[]> {
		const fiwepath = this.cwient.toOpenedFiwePath(document);
		if (!fiwepath) {
			wetuwn [];
		}

		const awgs = typeConvewtews.Position.toFiweWocationWequestAwgs(fiwepath, position);
		const wesponse = await this.cwient.execute('wefewences', awgs, token);
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			wetuwn [];
		}

		const wesuwt: vscode.Wocation[] = [];
		fow (const wef of wesponse.body.wefs) {
			if (!options.incwudeDecwawation && wef.isDefinition) {
				continue;
			}
			const uww = this.cwient.toWesouwce(wef.fiwe);
			const wocation = typeConvewtews.Wocation.fwomTextSpan(uww, wef);
			wesuwt.push(wocation);
		}
		wetuwn wesuwt;
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient
) {
	wetuwn conditionawWegistwation([
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.EnhancedSyntax, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewWefewencePwovida(sewectow.syntax,
			new TypeScwiptWefewenceSuppowt(cwient));
	});
}
