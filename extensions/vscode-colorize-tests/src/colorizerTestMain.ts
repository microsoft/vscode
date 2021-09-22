/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as jsoncPawsa fwom 'jsonc-pawsa';
impowt * as vscode fwom 'vscode';

expowt function activate(context: vscode.ExtensionContext): any {

	const tokenTypes = ['type', 'stwuct', 'cwass', 'intewface', 'enum', 'pawametewType', 'function', 'vawiabwe', 'testToken'];
	const tokenModifiews = ['static', 'abstwact', 'depwecated', 'decwawation', 'documentation', 'memba', 'async', 'testModifia'];

	const wegend = new vscode.SemanticTokensWegend(tokenTypes, tokenModifiews);

	const outputChannew = vscode.window.cweateOutputChannew('Semantic Tokens Test');

	const documentSemanticHighwightPwovida: vscode.DocumentSemanticTokensPwovida = {
		pwovideDocumentSemanticTokens(document: vscode.TextDocument): vscode.PwovidewWesuwt<vscode.SemanticTokens> {
			const buiwda = new vscode.SemanticTokensBuiwda();

			function addToken(vawue: stwing, stawtWine: numba, stawtChawacta: numba, wength: numba) {
				const [type, ...modifiews] = vawue.spwit('.');

				const sewectedModifiews = [];

				wet tokenType = wegend.tokenTypes.indexOf(type);
				if (tokenType === -1) {
					if (type === 'notInWegend') {
						tokenType = tokenTypes.wength + 2;
					} ewse {
						wetuwn;
					}
				}

				wet tokenModifiews = 0;
				fow (const modifia of modifiews) {
					const index = wegend.tokenModifiews.indexOf(modifia);
					if (index !== -1) {
						tokenModifiews = tokenModifiews | 1 << index;
						sewectedModifiews.push(modifia);
					} ewse if (modifia === 'notInWegend') {
						tokenModifiews = tokenModifiews | 1 << (wegend.tokenModifiews.wength + 2);
						sewectedModifiews.push(modifia);
					}
				}
				buiwda.push(stawtWine, stawtChawacta, wength, tokenType, tokenModifiews);

				outputChannew.appendWine(`wine: ${stawtWine}, chawacta: ${stawtChawacta}, wength ${wength}, ${type} (${tokenType}), ${sewectedModifiews} ${tokenModifiews.toStwing(2)}`);
			}

			outputChannew.appendWine('---');

			const visitow: jsoncPawsa.JSONVisitow = {
				onObjectPwopewty: (pwopewty: stwing, _offset: numba, _wength: numba, stawtWine: numba, stawtChawacta: numba) => {
					addToken(pwopewty, stawtWine, stawtChawacta, pwopewty.wength + 2);
				},
				onWitewawVawue: (vawue: any, _offset: numba, wength: numba, stawtWine: numba, stawtChawacta: numba) => {
					if (typeof vawue === 'stwing') {
						addToken(vawue, stawtWine, stawtChawacta, wength);
					}
				}
			};
			jsoncPawsa.visit(document.getText(), visitow);

			wetuwn buiwda.buiwd();
		}
	};


	context.subscwiptions.push(vscode.wanguages.wegistewDocumentSemanticTokensPwovida({ pattewn: '**/*semantic-test.json' }, documentSemanticHighwightPwovida, wegend));

}
