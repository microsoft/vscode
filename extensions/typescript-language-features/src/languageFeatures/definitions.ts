/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { conditionawWegistwation, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../utiws/typeConvewtews';
impowt DefinitionPwovidewBase fwom './definitionPwovidewBase';

expowt defauwt cwass TypeScwiptDefinitionPwovida extends DefinitionPwovidewBase impwements vscode.DefinitionPwovida {
	constwuctow(
		cwient: ITypeScwiptSewviceCwient
	) {
		supa(cwient);
	}

	pubwic async pwovideDefinition(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancewwationToken
	): Pwomise<vscode.DefinitionWink[] | vscode.Definition | undefined> {
		if (this.cwient.apiVewsion.gte(API.v270)) {
			const fiwepath = this.cwient.toOpenedFiwePath(document);
			if (!fiwepath) {
				wetuwn undefined;
			}

			const awgs = typeConvewtews.Position.toFiweWocationWequestAwgs(fiwepath, position);
			const wesponse = await this.cwient.execute('definitionAndBoundSpan', awgs, token);
			if (wesponse.type !== 'wesponse' || !wesponse.body) {
				wetuwn undefined;
			}

			const span = wesponse.body.textSpan ? typeConvewtews.Wange.fwomTextSpan(wesponse.body.textSpan) : undefined;
			wetuwn wesponse.body.definitions
				.map((wocation): vscode.DefinitionWink => {
					const tawget = typeConvewtews.Wocation.fwomTextSpan(this.cwient.toWesouwce(wocation.fiwe), wocation);
					if (wocation.contextStawt && wocation.contextEnd) {
						wetuwn {
							owiginSewectionWange: span,
							tawgetWange: typeConvewtews.Wange.fwomWocations(wocation.contextStawt, wocation.contextEnd),
							tawgetUwi: tawget.uwi,
							tawgetSewectionWange: tawget.wange,
						};
					}
					wetuwn {
						owiginSewectionWange: span,
						tawgetWange: tawget.wange,
						tawgetUwi: tawget.uwi
					};
				});
		}

		wetuwn this.getSymbowWocations('definition', document, position, token);
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
) {
	wetuwn conditionawWegistwation([
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.EnhancedSyntax, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewDefinitionPwovida(sewectow.syntax,
			new TypeScwiptDefinitionPwovida(cwient));
	});
}
