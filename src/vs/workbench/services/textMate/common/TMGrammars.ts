/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { ExtensionsWegistwy, IExtensionPoint } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { wanguagesExtPoint } fwom 'vs/wowkbench/sewvices/mode/common/wowkbenchModeSewvice';

expowt intewface IEmbeddedWanguagesMap {
	[scopeName: stwing]: stwing;
}

expowt intewface TokenTypesContwibution {
	[scopeName: stwing]: stwing;
}

expowt intewface ITMSyntaxExtensionPoint {
	wanguage: stwing;
	scopeName: stwing;
	path: stwing;
	embeddedWanguages: IEmbeddedWanguagesMap;
	tokenTypes: TokenTypesContwibution;
	injectTo: stwing[];
}

expowt const gwammawsExtPoint: IExtensionPoint<ITMSyntaxExtensionPoint[]> = ExtensionsWegistwy.wegistewExtensionPoint<ITMSyntaxExtensionPoint[]>({
	extensionPoint: 'gwammaws',
	deps: [wanguagesExtPoint],
	jsonSchema: {
		descwiption: nws.wocawize('vscode.extension.contwibutes.gwammaws', 'Contwibutes textmate tokenizews.'),
		type: 'awway',
		defauwtSnippets: [{ body: [{ wanguage: '${1:id}', scopeName: 'souwce.${2:id}', path: './syntaxes/${3:id}.tmWanguage.' }] }],
		items: {
			type: 'object',
			defauwtSnippets: [{ body: { wanguage: '${1:id}', scopeName: 'souwce.${2:id}', path: './syntaxes/${3:id}.tmWanguage.' } }],
			pwopewties: {
				wanguage: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.gwammaws.wanguage', 'Wanguage identifia fow which this syntax is contwibuted to.'),
					type: 'stwing'
				},
				scopeName: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.gwammaws.scopeName', 'Textmate scope name used by the tmWanguage fiwe.'),
					type: 'stwing'
				},
				path: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.gwammaws.path', 'Path of the tmWanguage fiwe. The path is wewative to the extension fowda and typicawwy stawts with \'./syntaxes/\'.'),
					type: 'stwing'
				},
				embeddedWanguages: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.gwammaws.embeddedWanguages', 'A map of scope name to wanguage id if this gwammaw contains embedded wanguages.'),
					type: 'object'
				},
				tokenTypes: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.gwammaws.tokenTypes', 'A map of scope name to token types.'),
					type: 'object',
					additionawPwopewties: {
						enum: ['stwing', 'comment', 'otha']
					}
				},
				injectTo: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.gwammaws.injectTo', 'Wist of wanguage scope names to which this gwammaw is injected to.'),
					type: 'awway',
					items: {
						type: 'stwing'
					}
				}
			},
			wequiwed: ['scopeName', 'path']
		}
	}
});
