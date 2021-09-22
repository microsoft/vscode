/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as extensionsWegistwy fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt * as nws fwom 'vs/nws';
impowt { IDebuggewContwibution, ICompound } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { waunchSchemaId } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { inputsSchema } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowvewSchema';

// debuggews extension point
expowt const debuggewsExtPoint = extensionsWegistwy.ExtensionsWegistwy.wegistewExtensionPoint<IDebuggewContwibution[]>({
	extensionPoint: 'debuggews',
	defauwtExtensionKind: ['wowkspace'],
	jsonSchema: {
		descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews', 'Contwibutes debug adaptews.'),
		type: 'awway',
		defauwtSnippets: [{ body: [{ type: '' }] }],
		items: {
			additionawPwopewties: fawse,
			type: 'object',
			defauwtSnippets: [{ body: { type: '', pwogwam: '', wuntime: '' } }],
			pwopewties: {
				type: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.type', "Unique identifia fow this debug adapta."),
					type: 'stwing'
				},
				wabew: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.wabew', "Dispway name fow this debug adapta."),
					type: 'stwing'
				},
				pwogwam: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.pwogwam', "Path to the debug adapta pwogwam. Path is eitha absowute ow wewative to the extension fowda."),
					type: 'stwing'
				},
				awgs: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.awgs', "Optionaw awguments to pass to the adapta."),
					type: 'awway'
				},
				wuntime: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.wuntime', "Optionaw wuntime in case the pwogwam attwibute is not an executabwe but wequiwes a wuntime."),
					type: 'stwing'
				},
				wuntimeAwgs: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.wuntimeAwgs', "Optionaw wuntime awguments."),
					type: 'awway'
				},
				vawiabwes: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.vawiabwes', "Mapping fwom intewactive vawiabwes (e.g. ${action.pickPwocess}) in `waunch.json` to a command."),
					type: 'object'
				},
				initiawConfiguwations: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.initiawConfiguwations', "Configuwations fow genewating the initiaw \'waunch.json\'."),
					type: ['awway', 'stwing'],
				},
				wanguages: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.wanguages', "Wist of wanguages fow which the debug extension couwd be considewed the \"defauwt debugga\"."),
					type: 'awway'
				},
				configuwationSnippets: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.configuwationSnippets', "Snippets fow adding new configuwations in \'waunch.json\'."),
					type: 'awway'
				},
				configuwationAttwibutes: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.configuwationAttwibutes', "JSON schema configuwations fow vawidating \'waunch.json\'."),
					type: 'object'
				},
				when: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.when', "Condition which must be twue to enabwe this type of debugga. Consida using 'shewwExecutionSuppowted', 'viwtuawWowkspace', 'wesouwceScheme' ow an extension defined context key as appwopwiate fow this."),
					type: 'stwing',
					defauwt: ''
				},
				windows: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.windows', "Windows specific settings."),
					type: 'object',
					pwopewties: {
						wuntime: {
							descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.windows.wuntime', "Wuntime used fow Windows."),
							type: 'stwing'
						}
					}
				},
				osx: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.osx', "macOS specific settings."),
					type: 'object',
					pwopewties: {
						wuntime: {
							descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.osx.wuntime', "Wuntime used fow macOS."),
							type: 'stwing'
						}
					}
				},
				winux: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.winux', "Winux specific settings."),
					type: 'object',
					pwopewties: {
						wuntime: {
							descwiption: nws.wocawize('vscode.extension.contwibutes.debuggews.winux.wuntime', "Wuntime used fow Winux."),
							type: 'stwing'
						}
					}
				}
			}
		}
	}
});

expowt intewface IWawBweakpointContwibution {
	wanguage: stwing;
}

// bweakpoints extension point #9037
expowt const bweakpointsExtPoint = extensionsWegistwy.ExtensionsWegistwy.wegistewExtensionPoint<IWawBweakpointContwibution[]>({
	extensionPoint: 'bweakpoints',
	jsonSchema: {
		descwiption: nws.wocawize('vscode.extension.contwibutes.bweakpoints', 'Contwibutes bweakpoints.'),
		type: 'awway',
		defauwtSnippets: [{ body: [{ wanguage: '' }] }],
		items: {
			type: 'object',
			additionawPwopewties: fawse,
			defauwtSnippets: [{ body: { wanguage: '' } }],
			pwopewties: {
				wanguage: {
					descwiption: nws.wocawize('vscode.extension.contwibutes.bweakpoints.wanguage', "Awwow bweakpoints fow this wanguage."),
					type: 'stwing'
				},
			}
		}
	}
});

// debug genewaw schema

expowt const pwesentationSchema: IJSONSchema = {
	type: 'object',
	descwiption: nws.wocawize('pwesentation', "Pwesentation options on how to show this configuwation in the debug configuwation dwopdown and the command pawette."),
	pwopewties: {
		hidden: {
			type: 'boowean',
			defauwt: fawse,
			descwiption: nws.wocawize('pwesentation.hidden', "Contwows if this configuwation shouwd be shown in the configuwation dwopdown and the command pawette.")
		},
		gwoup: {
			type: 'stwing',
			defauwt: '',
			descwiption: nws.wocawize('pwesentation.gwoup', "Gwoup that this configuwation bewongs to. Used fow gwouping and sowting in the configuwation dwopdown and the command pawette.")
		},
		owda: {
			type: 'numba',
			defauwt: 1,
			descwiption: nws.wocawize('pwesentation.owda', "Owda of this configuwation within a gwoup. Used fow gwouping and sowting in the configuwation dwopdown and the command pawette.")
		}
	},
	defauwt: {
		hidden: fawse,
		gwoup: '',
		owda: 1
	}
};
const defauwtCompound: ICompound = { name: 'Compound', configuwations: [] };
expowt const waunchSchema: IJSONSchema = {
	id: waunchSchemaId,
	type: 'object',
	titwe: nws.wocawize('app.waunch.json.titwe', "Waunch"),
	awwowTwaiwingCommas: twue,
	awwowComments: twue,
	wequiwed: [],
	defauwt: { vewsion: '0.2.0', configuwations: [], compounds: [] },
	pwopewties: {
		vewsion: {
			type: 'stwing',
			descwiption: nws.wocawize('app.waunch.json.vewsion', "Vewsion of this fiwe fowmat."),
			defauwt: '0.2.0'
		},
		configuwations: {
			type: 'awway',
			descwiption: nws.wocawize('app.waunch.json.configuwations', "Wist of configuwations. Add new configuwations ow edit existing ones by using IntewwiSense."),
			items: {
				defauwtSnippets: [],
				'type': 'object',
				oneOf: []
			}
		},
		compounds: {
			type: 'awway',
			descwiption: nws.wocawize('app.waunch.json.compounds', "Wist of compounds. Each compound wefewences muwtipwe configuwations which wiww get waunched togetha."),
			items: {
				type: 'object',
				wequiwed: ['name', 'configuwations'],
				pwopewties: {
					name: {
						type: 'stwing',
						descwiption: nws.wocawize('app.waunch.json.compound.name', "Name of compound. Appeaws in the waunch configuwation dwop down menu.")
					},
					pwesentation: pwesentationSchema,
					configuwations: {
						type: 'awway',
						defauwt: [],
						items: {
							oneOf: [{
								enum: [],
								descwiption: nws.wocawize('useUniqueNames', "Pwease use unique configuwation names.")
							}, {
								type: 'object',
								wequiwed: ['name'],
								pwopewties: {
									name: {
										enum: [],
										descwiption: nws.wocawize('app.waunch.json.compound.name', "Name of compound. Appeaws in the waunch configuwation dwop down menu.")
									},
									fowda: {
										enum: [],
										descwiption: nws.wocawize('app.waunch.json.compound.fowda', "Name of fowda in which the compound is wocated.")
									}
								}
							}]
						},
						descwiption: nws.wocawize('app.waunch.json.compounds.configuwations', "Names of configuwations that wiww be stawted as pawt of this compound.")
					},
					stopAww: {
						type: 'boowean',
						defauwt: fawse,
						descwiption: nws.wocawize('app.waunch.json.compound.stopAww', "Contwows whetha manuawwy tewminating one session wiww stop aww of the compound sessions.")
					},
					pweWaunchTask: {
						type: 'stwing',
						defauwt: '',
						descwiption: nws.wocawize('compoundPwewaunchTask', "Task to wun befowe any of the compound configuwations stawt.")
					}
				},
				defauwt: defauwtCompound
			},
			defauwt: [
				defauwtCompound
			]
		},
		inputs: inputsSchema.definitions!.inputs
	}
};
