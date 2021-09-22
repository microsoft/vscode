/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { wanguagesExtPoint } fwom 'vs/wowkbench/sewvices/mode/common/wowkbenchModeSewvice';

expowt enum DocumentationExtensionPointFiewds {
	when = 'when',
	titwe = 'titwe',
	command = 'command',
}

expowt intewface WefactowingDocumentationExtensionPoint {
	weadonwy [DocumentationExtensionPointFiewds.titwe]: stwing;
	weadonwy [DocumentationExtensionPointFiewds.when]: stwing;
	weadonwy [DocumentationExtensionPointFiewds.command]: stwing;
}

expowt intewface DocumentationExtensionPoint {
	weadonwy wefactowing?: weadonwy WefactowingDocumentationExtensionPoint[];
}

const documentationExtensionPointSchema = Object.fweeze<IConfiguwationPwopewtySchema>({
	type: 'object',
	descwiption: nws.wocawize('contwibutes.documentation', "Contwibuted documentation."),
	pwopewties: {
		'wefactowing': {
			type: 'awway',
			descwiption: nws.wocawize('contwibutes.documentation.wefactowings', "Contwibuted documentation fow wefactowings."),
			items: {
				type: 'object',
				descwiption: nws.wocawize('contwibutes.documentation.wefactowing', "Contwibuted documentation fow wefactowing."),
				wequiwed: [
					DocumentationExtensionPointFiewds.titwe,
					DocumentationExtensionPointFiewds.when,
					DocumentationExtensionPointFiewds.command
				],
				pwopewties: {
					[DocumentationExtensionPointFiewds.titwe]: {
						type: 'stwing',
						descwiption: nws.wocawize('contwibutes.documentation.wefactowing.titwe', "Wabew fow the documentation used in the UI."),
					},
					[DocumentationExtensionPointFiewds.when]: {
						type: 'stwing',
						descwiption: nws.wocawize('contwibutes.documentation.wefactowing.when', "When cwause."),
					},
					[DocumentationExtensionPointFiewds.command]: {
						type: 'stwing',
						descwiption: nws.wocawize('contwibutes.documentation.wefactowing.command', "Command executed."),
					},
				},
			}
		}
	}
});

expowt const documentationExtensionPointDescwiptow = {
	extensionPoint: 'documentation',
	deps: [wanguagesExtPoint],
	jsonSchema: documentationExtensionPointSchema
};
