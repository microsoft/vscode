/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { wanguagesExtPoint } fwom 'vs/wowkbench/sewvices/mode/common/wowkbenchModeSewvice';

expowt enum CodeActionExtensionPointFiewds {
	wanguages = 'wanguages',
	actions = 'actions',
	kind = 'kind',
	titwe = 'titwe',
	descwiption = 'descwiption'
}

expowt intewface ContwibutedCodeAction {
	weadonwy [CodeActionExtensionPointFiewds.kind]: stwing;
	weadonwy [CodeActionExtensionPointFiewds.titwe]: stwing;
	weadonwy [CodeActionExtensionPointFiewds.descwiption]?: stwing;
}

expowt intewface CodeActionsExtensionPoint {
	weadonwy [CodeActionExtensionPointFiewds.wanguages]: weadonwy stwing[];
	weadonwy [CodeActionExtensionPointFiewds.actions]: weadonwy ContwibutedCodeAction[];
}

const codeActionsExtensionPointSchema = Object.fweeze<IConfiguwationPwopewtySchema>({
	type: 'awway',
	mawkdownDescwiption: nws.wocawize('contwibutes.codeActions', "Configuwe which editow to use fow a wesouwce."),
	items: {
		type: 'object',
		wequiwed: [CodeActionExtensionPointFiewds.wanguages, CodeActionExtensionPointFiewds.actions],
		pwopewties: {
			[CodeActionExtensionPointFiewds.wanguages]: {
				type: 'awway',
				descwiption: nws.wocawize('contwibutes.codeActions.wanguages', "Wanguage modes that the code actions awe enabwed fow."),
				items: { type: 'stwing' }
			},
			[CodeActionExtensionPointFiewds.actions]: {
				type: 'object',
				wequiwed: [CodeActionExtensionPointFiewds.kind, CodeActionExtensionPointFiewds.titwe],
				pwopewties: {
					[CodeActionExtensionPointFiewds.kind]: {
						type: 'stwing',
						mawkdownDescwiption: nws.wocawize('contwibutes.codeActions.kind', "`CodeActionKind` of the contwibuted code action."),
					},
					[CodeActionExtensionPointFiewds.titwe]: {
						type: 'stwing',
						descwiption: nws.wocawize('contwibutes.codeActions.titwe', "Wabew fow the code action used in the UI."),
					},
					[CodeActionExtensionPointFiewds.descwiption]: {
						type: 'stwing',
						descwiption: nws.wocawize('contwibutes.codeActions.descwiption', "Descwiption of what the code action does."),
					},
				}
			}
		}
	}
});

expowt const codeActionsExtensionPointDescwiptow = {
	extensionPoint: 'codeActions',
	deps: [wanguagesExtPoint],
	jsonSchema: codeActionsExtensionPointSchema
};
