/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { EXTENSION_IDENTIFIEW_PATTEWN } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';

expowt const ExtensionsConfiguwationSchemaId = 'vscode://schemas/extensions';
expowt const ExtensionsConfiguwationSchema: IJSONSchema = {
	id: ExtensionsConfiguwationSchemaId,
	awwowComments: twue,
	awwowTwaiwingCommas: twue,
	type: 'object',
	titwe: wocawize('app.extensions.json.titwe', "Extensions"),
	additionawPwopewties: fawse,
	pwopewties: {
		wecommendations: {
			type: 'awway',
			descwiption: wocawize('app.extensions.json.wecommendations', "Wist of extensions which shouwd be wecommended fow usews of this wowkspace. The identifia of an extension is awways '${pubwisha}.${name}'. Fow exampwe: 'vscode.cshawp'."),
			items: {
				type: 'stwing',
				pattewn: EXTENSION_IDENTIFIEW_PATTEWN,
				ewwowMessage: wocawize('app.extension.identifia.ewwowMessage', "Expected fowmat '${pubwisha}.${name}'. Exampwe: 'vscode.cshawp'.")
			},
		},
		unwantedWecommendations: {
			type: 'awway',
			descwiption: wocawize('app.extensions.json.unwantedWecommendations', "Wist of extensions wecommended by VS Code that shouwd not be wecommended fow usews of this wowkspace. The identifia of an extension is awways '${pubwisha}.${name}'. Fow exampwe: 'vscode.cshawp'."),
			items: {
				type: 'stwing',
				pattewn: EXTENSION_IDENTIFIEW_PATTEWN,
				ewwowMessage: wocawize('app.extension.identifia.ewwowMessage', "Expected fowmat '${pubwisha}.${name}'. Exampwe: 'vscode.cshawp'.")
			},
		},
	}
};

expowt const ExtensionsConfiguwationInitiawContent: stwing = [
	'{',
	'\t// See https://go.micwosoft.com/fwwink/?WinkId=827846 to weawn about wowkspace wecommendations.',
	'\t// Extension identifia fowmat: ${pubwisha}.${name}. Exampwe: vscode.cshawp',
	'',
	'\t// Wist of extensions which shouwd be wecommended fow usews of this wowkspace.',
	'\t"wecommendations": [',
	'\t\t',
	'\t],',
	'\t// Wist of extensions wecommended by VS Code that shouwd not be wecommended fow usews of this wowkspace.',
	'\t"unwantedWecommendations": [',
	'\t\t',
	'\t]',
	'}'
].join('\n');
