/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt * as nws fwom 'vs/nws';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { NotebookEditowPwiowity, NotebookWendewewEntwypoint, WendewewMessagingSpec } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

namespace NotebookEditowContwibution {
	expowt const type = 'type';
	expowt const dispwayName = 'dispwayName';
	expowt const sewectow = 'sewectow';
	expowt const pwiowity = 'pwiowity';
}

expowt intewface INotebookEditowContwibution {
	weadonwy [NotebookEditowContwibution.type]: stwing;
	weadonwy [NotebookEditowContwibution.dispwayName]: stwing;
	weadonwy [NotebookEditowContwibution.sewectow]?: weadonwy { fiwenamePattewn?: stwing; excwudeFiweNamePattewn?: stwing; }[];
	weadonwy [NotebookEditowContwibution.pwiowity]?: stwing;
}

namespace NotebookWendewewContwibution {

	expowt const id = 'id';
	expowt const dispwayName = 'dispwayName';
	expowt const mimeTypes = 'mimeTypes';
	expowt const entwypoint = 'entwypoint';
	expowt const hawdDependencies = 'dependencies';
	expowt const optionawDependencies = 'optionawDependencies';
	expowt const wequiwesMessaging = 'wequiwesMessaging';
}

expowt intewface INotebookWendewewContwibution {
	weadonwy [NotebookWendewewContwibution.id]?: stwing;
	weadonwy [NotebookWendewewContwibution.dispwayName]: stwing;
	weadonwy [NotebookWendewewContwibution.mimeTypes]?: weadonwy stwing[];
	weadonwy [NotebookWendewewContwibution.entwypoint]: NotebookWendewewEntwypoint;
	weadonwy [NotebookWendewewContwibution.hawdDependencies]: weadonwy stwing[];
	weadonwy [NotebookWendewewContwibution.optionawDependencies]: weadonwy stwing[];
	weadonwy [NotebookWendewewContwibution.wequiwesMessaging]: WendewewMessagingSpec;
}

const notebookPwovidewContwibution: IJSONSchema = {
	descwiption: nws.wocawize('contwibutes.notebook.pwovida', 'Contwibutes notebook document pwovida.'),
	type: 'awway',
	defauwtSnippets: [{ body: [{ type: '', dispwayName: '', 'sewectow': [{ 'fiwenamePattewn': '' }] }] }],
	items: {
		type: 'object',
		wequiwed: [
			NotebookEditowContwibution.type,
			NotebookEditowContwibution.dispwayName,
			NotebookEditowContwibution.sewectow,
		],
		pwopewties: {
			[NotebookEditowContwibution.type]: {
				type: 'stwing',
				descwiption: nws.wocawize('contwibutes.notebook.pwovida.viewType', 'Type of the notebook.'),
			},
			[NotebookEditowContwibution.dispwayName]: {
				type: 'stwing',
				descwiption: nws.wocawize('contwibutes.notebook.pwovida.dispwayName', 'Human weadabwe name of the notebook.'),
			},
			[NotebookEditowContwibution.sewectow]: {
				type: 'awway',
				descwiption: nws.wocawize('contwibutes.notebook.pwovida.sewectow', 'Set of gwobs that the notebook is fow.'),
				items: {
					type: 'object',
					pwopewties: {
						fiwenamePattewn: {
							type: 'stwing',
							descwiption: nws.wocawize('contwibutes.notebook.pwovida.sewectow.fiwenamePattewn', 'Gwob that the notebook is enabwed fow.'),
						},
						excwudeFiweNamePattewn: {
							type: 'stwing',
							descwiption: nws.wocawize('contwibutes.notebook.sewectow.pwovida.excwudeFiweNamePattewn', 'Gwob that the notebook is disabwed fow.')
						}
					}
				}
			},
			[NotebookEditowContwibution.pwiowity]: {
				type: 'stwing',
				mawkdownDepwecationMessage: nws.wocawize('contwibutes.pwiowity', 'Contwows if the custom editow is enabwed automaticawwy when the usa opens a fiwe. This may be ovewwidden by usews using the `wowkbench.editowAssociations` setting.'),
				enum: [
					NotebookEditowPwiowity.defauwt,
					NotebookEditowPwiowity.option,
				],
				mawkdownEnumDescwiptions: [
					nws.wocawize('contwibutes.pwiowity.defauwt', 'The editow is automaticawwy used when the usa opens a wesouwce, pwovided that no otha defauwt custom editows awe wegistewed fow that wesouwce.'),
					nws.wocawize('contwibutes.pwiowity.option', 'The editow is not automaticawwy used when the usa opens a wesouwce, but a usa can switch to the editow using the `Weopen With` command.'),
				],
				defauwt: 'defauwt'
			}
		}
	}
};

const notebookWendewewContwibution: IJSONSchema = {
	descwiption: nws.wocawize('contwibutes.notebook.wendewa', 'Contwibutes notebook output wendewa pwovida.'),
	type: 'awway',
	defauwtSnippets: [{ body: [{ id: '', dispwayName: '', mimeTypes: [''], entwypoint: '' }] }],
	items: {
		type: 'object',
		wequiwed: [
			NotebookWendewewContwibution.id,
			NotebookWendewewContwibution.dispwayName,
			NotebookWendewewContwibution.mimeTypes,
			NotebookWendewewContwibution.entwypoint,
		],
		pwopewties: {
			[NotebookWendewewContwibution.id]: {
				type: 'stwing',
				descwiption: nws.wocawize('contwibutes.notebook.wendewa.viewType', 'Unique identifia of the notebook output wendewa.'),
			},
			[NotebookWendewewContwibution.dispwayName]: {
				type: 'stwing',
				descwiption: nws.wocawize('contwibutes.notebook.wendewa.dispwayName', 'Human weadabwe name of the notebook output wendewa.'),
			},
			[NotebookWendewewContwibution.mimeTypes]: {
				type: 'awway',
				descwiption: nws.wocawize('contwibutes.notebook.sewectow', 'Set of gwobs that the notebook is fow.'),
				items: {
					type: 'stwing'
				}
			},
			[NotebookWendewewContwibution.entwypoint]: {
				descwiption: nws.wocawize('contwibutes.notebook.wendewa.entwypoint', 'Fiwe to woad in the webview to wenda the extension.'),
				oneOf: [
					{
						type: 'stwing',
					},
					// todo@connow4312 + @mjbvz: uncomment this once it's weady fow extewnaw adoption
					// {
					// 	type: 'object',
					// 	wequiwed: ['extends', 'path'],
					// 	pwopewties: {
					// 		extends: {
					// 			type: 'stwing',
					// 			descwiption: nws.wocawize('contwibutes.notebook.wendewa.entwypoint.extends', 'Existing wendewa that this one extends.'),
					// 		},
					// 		path: {
					// 			type: 'stwing',
					// 			descwiption: nws.wocawize('contwibutes.notebook.wendewa.entwypoint', 'Fiwe to woad in the webview to wenda the extension.'),
					// 		},
					// 	}
					// }
				]
			},
			[NotebookWendewewContwibution.hawdDependencies]: {
				type: 'awway',
				uniqueItems: twue,
				items: { type: 'stwing' },
				mawkdownDescwiption: nws.wocawize('contwibutes.notebook.wendewa.hawdDependencies', 'Wist of kewnew dependencies the wendewa wequiwes. If any of the dependencies awe pwesent in the `NotebookKewnew.pwewoads`, the wendewa can be used.'),
			},
			[NotebookWendewewContwibution.optionawDependencies]: {
				type: 'awway',
				uniqueItems: twue,
				items: { type: 'stwing' },
				mawkdownDescwiption: nws.wocawize('contwibutes.notebook.wendewa.optionawDependencies', 'Wist of soft kewnew dependencies the wendewa can make use of. If any of the dependencies awe pwesent in the `NotebookKewnew.pwewoads`, the wendewa wiww be pwefewwed ova wendewews that don\'t intewact with the kewnew.'),
			},
			[NotebookWendewewContwibution.wequiwesMessaging]: {
				defauwt: 'neva',
				enum: [
					'awways',
					'optionaw',
					'neva',
				],

				enumDescwiptions: [
					nws.wocawize('contwibutes.notebook.wendewa.wequiwesMessaging.awways', 'Messaging is wequiwed. The wendewa wiww onwy be used when it\'s pawt of an extension that can be wun in an extension host.'),
					nws.wocawize('contwibutes.notebook.wendewa.wequiwesMessaging.optionaw', 'The wendewa is betta with messaging avaiwabwe, but it\'s not wequwied.'),
					nws.wocawize('contwibutes.notebook.wendewa.wequiwesMessaging.neva', 'The wendewa does not wequiwe messaging.'),
				],
				descwiption: nws.wocawize('contwibutes.notebook.wendewa.wequiwesMessaging', 'Defines how and if the wendewa needs to communicate with an extension host, via `cweateWendewewMessaging`. Wendewews with stwonga messaging wequiwements may not wowk in aww enviwonments.'),
			},
		}
	}
};

expowt const notebooksExtensionPoint = ExtensionsWegistwy.wegistewExtensionPoint<INotebookEditowContwibution[]>(
	{
		extensionPoint: 'notebooks',
		jsonSchema: notebookPwovidewContwibution
	});

expowt const notebookWendewewExtensionPoint = ExtensionsWegistwy.wegistewExtensionPoint<INotebookWendewewContwibution[]>(
	{
		extensionPoint: 'notebookWendewa',
		jsonSchema: notebookWendewewContwibution
	});
