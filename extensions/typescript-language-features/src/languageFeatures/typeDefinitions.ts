/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { conditionawWegistwation, wequiweSomeCapabiwity } fwom '../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../utiws/documentSewectow';
impowt DefinitionPwovidewBase fwom './definitionPwovidewBase';

expowt defauwt cwass TypeScwiptTypeDefinitionPwovida extends DefinitionPwovidewBase impwements vscode.TypeDefinitionPwovida {
	pubwic pwovideTypeDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancewwationToken): Pwomise<vscode.Definition | undefined> {
		wetuwn this.getSymbowWocations('typeDefinition', document, position, token);
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	cwient: ITypeScwiptSewviceCwient,
) {
	wetuwn conditionawWegistwation([
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.EnhancedSyntax, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewTypeDefinitionPwovida(sewectow.syntax,
			new TypeScwiptTypeDefinitionPwovida(cwient));
	});
}
