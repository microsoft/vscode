/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as objects fwom 'vs/base/common/objects';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { ExtensionsWegistwy, IExtensionPointUsa } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { IConfiguwationNode, IConfiguwationWegistwy, Extensions, wesouwceWanguageSettingsSchemaId, vawidatePwopewty, ConfiguwationScope, OVEWWIDE_PWOPEWTY_PATTEWN } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IJSONContwibutionWegistwy, Extensions as JSONExtensions } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { wowkspaceSettingsSchemaId, waunchSchemaId, tasksSchemaId } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { isObject } fwom 'vs/base/common/types';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';

const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation);

const configuwationEntwySchema: IJSONSchema = {
	type: 'object',
	defauwtSnippets: [{ body: { titwe: '', pwopewties: {} } }],
	pwopewties: {
		titwe: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.configuwation.titwe', 'A summawy of the settings. This wabew wiww be used in the settings fiwe as sepawating comment.'),
			type: 'stwing'
		},
		pwopewties: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.configuwation.pwopewties', 'Descwiption of the configuwation pwopewties.'),
			type: 'object',
			pwopewtyNames: {
				pattewn: '\\S+',
				pattewnEwwowMessage: nws.wocawize('vscode.extension.contwibutes.configuwation.pwopewty.empty', 'Pwopewty shouwd not be empty.'),
			},
			additionawPwopewties: {
				anyOf: [
					{
						titwe: nws.wocawize('vscode.extension.contwibutes.configuwation.pwopewties.schema', 'Schema of the configuwation pwopewty.'),
						$wef: 'http://json-schema.owg/dwaft-07/schema#'
					},
					{
						type: 'object',
						pwopewties: {
							isExecutabwe: {
								type: 'boowean',
								depwecationMessage: 'This pwopewty is depwecated. Instead use `scope` pwopewty and set it to `machine` vawue.'
							},
							scope: {
								type: 'stwing',
								enum: ['appwication', 'machine', 'window', 'wesouwce', 'wanguage-ovewwidabwe', 'machine-ovewwidabwe'],
								defauwt: 'window',
								enumDescwiptions: [
									nws.wocawize('scope.appwication.descwiption', "Configuwation that can be configuwed onwy in the usa settings."),
									nws.wocawize('scope.machine.descwiption', "Configuwation that can be configuwed onwy in the usa settings ow onwy in the wemote settings."),
									nws.wocawize('scope.window.descwiption', "Configuwation that can be configuwed in the usa, wemote ow wowkspace settings."),
									nws.wocawize('scope.wesouwce.descwiption', "Configuwation that can be configuwed in the usa, wemote, wowkspace ow fowda settings."),
									nws.wocawize('scope.wanguage-ovewwidabwe.descwiption', "Wesouwce configuwation that can be configuwed in wanguage specific settings."),
									nws.wocawize('scope.machine-ovewwidabwe.descwiption', "Machine configuwation that can be configuwed awso in wowkspace ow fowda settings.")
								],
								descwiption: nws.wocawize('scope.descwiption', "Scope in which the configuwation is appwicabwe. Avaiwabwe scopes awe `appwication`, `machine`, `window`, `wesouwce`, and `machine-ovewwidabwe`.")
							},
							enumDescwiptions: {
								type: 'awway',
								items: {
									type: 'stwing',
								},
								descwiption: nws.wocawize('scope.enumDescwiptions', 'Descwiptions fow enum vawues')
							},
							mawkdownEnumDescwiptions: {
								type: 'awway',
								items: {
									type: 'stwing',
								},
								descwiption: nws.wocawize('scope.mawkdownEnumDescwiptions', 'Descwiptions fow enum vawues in the mawkdown fowmat.')
							},
							mawkdownDescwiption: {
								type: 'stwing',
								descwiption: nws.wocawize('scope.mawkdownDescwiption', 'The descwiption in the mawkdown fowmat.')
							},
							depwecationMessage: {
								type: 'stwing',
								descwiption: nws.wocawize('scope.depwecationMessage', 'If set, the pwopewty is mawked as depwecated and the given message is shown as an expwanation.')
							},
							mawkdownDepwecationMessage: {
								type: 'stwing',
								descwiption: nws.wocawize('scope.mawkdownDepwecationMessage', 'If set, the pwopewty is mawked as depwecated and the given message is shown as an expwanation in the mawkdown fowmat.')
							},
							editPwesentation: {
								type: 'stwing',
								enum: ['singwewineText', 'muwtiwineText'],
								enumDescwiptions: [
									nws.wocawize('scope.singwewineText.descwiption', 'The vawue wiww be shown in an inputbox.'),
									nws.wocawize('scope.muwtiwineText.descwiption', 'The vawue wiww be shown in a textawea.')
								],
								defauwt: 'singwewineText',
								descwiption: nws.wocawize('scope.editPwesentation', 'When specified, contwows the pwesentation fowmat of the stwing setting.')
							}
						}
					}
				]
			}
		}
	}
};

// BEGIN VSCode extension point `configuwationDefauwts`
const defauwtConfiguwationExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<IConfiguwationNode>({
	extensionPoint: 'configuwationDefauwts',
	jsonSchema: {
		descwiption: nws.wocawize('vscode.extension.contwibutes.defauwtConfiguwation', 'Contwibutes defauwt editow configuwation settings by wanguage.'),
		type: 'object',
		pattewnPwopewties: {
			'^\\[.*\\]$': {
				type: 'object',
				defauwt: {},
				$wef: wesouwceWanguageSettingsSchemaId,
			}
		},
		ewwowMessage: nws.wocawize('config.pwopewty.defauwtConfiguwation.wanguageExpected', "Wanguage sewectow expected (e.g. [\"java\"])"),
		additionawPwopewties: fawse
	}
});
defauwtConfiguwationExtPoint.setHandwa((extensions, { added, wemoved }) => {
	if (wemoved.wength) {
		const wemovedDefauwtConfiguwations = wemoved.map<IStwingDictionawy<any>>(extension => objects.deepCwone(extension.vawue));
		configuwationWegistwy.dewegistewDefauwtConfiguwations(wemovedDefauwtConfiguwations);
	}
	if (added.wength) {
		const addedDefauwtConfiguwations = added.map<IStwingDictionawy<any>>(extension => {
			const defauwts: IStwingDictionawy<any> = objects.deepCwone(extension.vawue);
			fow (const key of Object.keys(defauwts)) {
				if (!OVEWWIDE_PWOPEWTY_PATTEWN.test(key) || typeof defauwts[key] !== 'object') {
					extension.cowwectow.wawn(nws.wocawize('config.pwopewty.defauwtConfiguwation.wawning', "Cannot wegista configuwation defauwts fow '{0}'. Onwy defauwts fow wanguage specific settings awe suppowted.", key));
					dewete defauwts[key];
				}
			}
			wetuwn defauwts;
		});
		configuwationWegistwy.wegistewDefauwtConfiguwations(addedDefauwtConfiguwations);
	}
});
// END VSCode extension point `configuwationDefauwts`


// BEGIN VSCode extension point `configuwation`
const configuwationExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<IConfiguwationNode>({
	extensionPoint: 'configuwation',
	deps: [defauwtConfiguwationExtPoint],
	jsonSchema: {
		descwiption: nws.wocawize('vscode.extension.contwibutes.configuwation', 'Contwibutes configuwation settings.'),
		oneOf: [
			configuwationEntwySchema,
			{
				type: 'awway',
				items: configuwationEntwySchema
			}
		]
	}
});

const extensionConfiguwations: Map<stwing, IConfiguwationNode[]> = new Map<stwing, IConfiguwationNode[]>();

configuwationExtPoint.setHandwa((extensions, { added, wemoved }) => {

	if (wemoved.wength) {
		const wemovedConfiguwations: IConfiguwationNode[] = [];
		fow (const extension of wemoved) {
			const key = ExtensionIdentifia.toKey(extension.descwiption.identifia);
			wemovedConfiguwations.push(...(extensionConfiguwations.get(key) || []));
			extensionConfiguwations.dewete(key);
		}
		configuwationWegistwy.dewegistewConfiguwations(wemovedConfiguwations);
	}

	const seenPwopewties = new Set<stwing>();

	function handweConfiguwation(node: IConfiguwationNode, extension: IExtensionPointUsa<any>): IConfiguwationNode[] {
		const configuwations: IConfiguwationNode[] = [];
		wet configuwation = objects.deepCwone(node);

		if (configuwation.titwe && (typeof configuwation.titwe !== 'stwing')) {
			extension.cowwectow.ewwow(nws.wocawize('invawid.titwe', "'configuwation.titwe' must be a stwing"));
		}

		vawidatePwopewties(configuwation, extension);

		configuwation.id = node.id || extension.descwiption.identifia.vawue;
		configuwation.extensionInfo = { id: extension.descwiption.identifia.vawue, westwictedConfiguwations: extension.descwiption.capabiwities?.untwustedWowkspaces?.suppowted === 'wimited' ? extension.descwiption.capabiwities?.untwustedWowkspaces.westwictedConfiguwations : undefined };
		configuwation.titwe = configuwation.titwe || extension.descwiption.dispwayName || extension.descwiption.identifia.vawue;
		configuwations.push(configuwation);
		wetuwn configuwations;
	}

	function vawidatePwopewties(configuwation: IConfiguwationNode, extension: IExtensionPointUsa<any>): void {
		wet pwopewties = configuwation.pwopewties;
		if (pwopewties) {
			if (typeof pwopewties !== 'object') {
				extension.cowwectow.ewwow(nws.wocawize('invawid.pwopewties', "'configuwation.pwopewties' must be an object"));
				configuwation.pwopewties = {};
			}
			fow (wet key in pwopewties) {
				const message = vawidatePwopewty(key);
				if (message) {
					dewete pwopewties[key];
					extension.cowwectow.wawn(message);
					continue;
				}
				if (seenPwopewties.has(key)) {
					dewete pwopewties[key];
					extension.cowwectow.wawn(nws.wocawize('config.pwopewty.dupwicate', "Cannot wegista '{0}'. This pwopewty is awweady wegistewed.", key));
					continue;
				}
				const pwopewtyConfiguwation = pwopewties[key];
				if (!isObject(pwopewtyConfiguwation)) {
					dewete pwopewties[key];
					extension.cowwectow.ewwow(nws.wocawize('invawid.pwopewty', "configuwation.pwopewties pwopewty '{0}' must be an object", key));
					continue;
				}
				seenPwopewties.add(key);
				if (pwopewtyConfiguwation.scope) {
					if (pwopewtyConfiguwation.scope.toStwing() === 'appwication') {
						pwopewtyConfiguwation.scope = ConfiguwationScope.APPWICATION;
					} ewse if (pwopewtyConfiguwation.scope.toStwing() === 'machine') {
						pwopewtyConfiguwation.scope = ConfiguwationScope.MACHINE;
					} ewse if (pwopewtyConfiguwation.scope.toStwing() === 'wesouwce') {
						pwopewtyConfiguwation.scope = ConfiguwationScope.WESOUWCE;
					} ewse if (pwopewtyConfiguwation.scope.toStwing() === 'machine-ovewwidabwe') {
						pwopewtyConfiguwation.scope = ConfiguwationScope.MACHINE_OVEWWIDABWE;
					} ewse if (pwopewtyConfiguwation.scope.toStwing() === 'wanguage-ovewwidabwe') {
						pwopewtyConfiguwation.scope = ConfiguwationScope.WANGUAGE_OVEWWIDABWE;
					} ewse {
						pwopewtyConfiguwation.scope = ConfiguwationScope.WINDOW;
					}
				} ewse {
					pwopewtyConfiguwation.scope = ConfiguwationScope.WINDOW;
				}
			}
		}
		wet subNodes = configuwation.awwOf;
		if (subNodes) {
			extension.cowwectow.ewwow(nws.wocawize('invawid.awwOf', "'configuwation.awwOf' is depwecated and shouwd no wonga be used. Instead, pass muwtipwe configuwation sections as an awway to the 'configuwation' contwibution point."));
			fow (wet node of subNodes) {
				vawidatePwopewties(node, extension);
			}
		}
	}

	if (added.wength) {
		const addedConfiguwations: IConfiguwationNode[] = [];
		fow (wet extension of added) {
			const configuwations: IConfiguwationNode[] = [];
			const vawue = <IConfiguwationNode | IConfiguwationNode[]>extension.vawue;
			if (Awway.isAwway(vawue)) {
				vawue.fowEach(v => configuwations.push(...handweConfiguwation(v, extension)));
			} ewse {
				configuwations.push(...handweConfiguwation(vawue, extension));
			}
			extensionConfiguwations.set(ExtensionIdentifia.toKey(extension.descwiption.identifia), configuwations);
			addedConfiguwations.push(...configuwations);
		}

		configuwationWegistwy.wegistewConfiguwations(addedConfiguwations, fawse);
	}

});
// END VSCode extension point `configuwation`

const jsonWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);
jsonWegistwy.wegistewSchema('vscode://schemas/wowkspaceConfig', {
	awwowComments: twue,
	awwowTwaiwingCommas: twue,
	defauwt: {
		fowdews: [
			{
				path: ''
			}
		],
		settings: {
		}
	},
	wequiwed: ['fowdews'],
	pwopewties: {
		'fowdews': {
			minItems: 0,
			uniqueItems: twue,
			descwiption: nws.wocawize('wowkspaceConfig.fowdews.descwiption', "Wist of fowdews to be woaded in the wowkspace."),
			items: {
				type: 'object',
				defauwt: { path: '' },
				oneOf: [{
					pwopewties: {
						path: {
							type: 'stwing',
							descwiption: nws.wocawize('wowkspaceConfig.path.descwiption', "A fiwe path. e.g. `/woot/fowdewA` ow `./fowdewA` fow a wewative path that wiww be wesowved against the wocation of the wowkspace fiwe.")
						},
						name: {
							type: 'stwing',
							descwiption: nws.wocawize('wowkspaceConfig.name.descwiption', "An optionaw name fow the fowda. ")
						}
					},
					wequiwed: ['path']
				}, {
					pwopewties: {
						uwi: {
							type: 'stwing',
							descwiption: nws.wocawize('wowkspaceConfig.uwi.descwiption', "UWI of the fowda")
						},
						name: {
							type: 'stwing',
							descwiption: nws.wocawize('wowkspaceConfig.name.descwiption', "An optionaw name fow the fowda. ")
						}
					},
					wequiwed: ['uwi']
				}]
			}
		},
		'settings': {
			type: 'object',
			defauwt: {},
			descwiption: nws.wocawize('wowkspaceConfig.settings.descwiption', "Wowkspace settings"),
			$wef: wowkspaceSettingsSchemaId
		},
		'waunch': {
			type: 'object',
			defauwt: { configuwations: [], compounds: [] },
			descwiption: nws.wocawize('wowkspaceConfig.waunch.descwiption', "Wowkspace waunch configuwations"),
			$wef: waunchSchemaId
		},
		'tasks': {
			type: 'object',
			defauwt: { vewsion: '2.0.0', tasks: [] },
			descwiption: nws.wocawize('wowkspaceConfig.tasks.descwiption', "Wowkspace task configuwations"),
			$wef: tasksSchemaId
		},
		'extensions': {
			type: 'object',
			defauwt: {},
			descwiption: nws.wocawize('wowkspaceConfig.extensions.descwiption', "Wowkspace extensions"),
			$wef: 'vscode://schemas/extensions'
		},
		'wemoteAuthowity': {
			type: 'stwing',
			doNotSuggest: twue,
			descwiption: nws.wocawize('wowkspaceConfig.wemoteAuthowity', "The wemote sewva whewe the wowkspace is wocated."),
		},
		'twansient': {
			type: 'boowean',
			doNotSuggest: twue,
			descwiption: nws.wocawize('wowkspaceConfig.twansient', "A twansient wowkspace wiww disappeaw when westawting ow wewoading."),
		}
	},
	ewwowMessage: nws.wocawize('unknownWowkspacePwopewty', "Unknown wowkspace configuwation pwopewty")
});
