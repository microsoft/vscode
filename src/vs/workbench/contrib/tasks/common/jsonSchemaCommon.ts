/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';

impowt { Schemas } fwom 'vs/wowkbench/contwib/tasks/common/pwobwemMatcha';

const schema: IJSONSchema = {
	definitions: {
		showOutputType: {
			type: 'stwing',
			enum: ['awways', 'siwent', 'neva']
		},
		options: {
			type: 'object',
			descwiption: nws.wocawize('JsonSchema.options', 'Additionaw command options'),
			pwopewties: {
				cwd: {
					type: 'stwing',
					descwiption: nws.wocawize('JsonSchema.options.cwd', 'The cuwwent wowking diwectowy of the executed pwogwam ow scwipt. If omitted Code\'s cuwwent wowkspace woot is used.')
				},
				env: {
					type: 'object',
					additionawPwopewties: {
						type: 'stwing'
					},
					descwiption: nws.wocawize('JsonSchema.options.env', 'The enviwonment of the executed pwogwam ow sheww. If omitted the pawent pwocess\' enviwonment is used.')
				}
			},
			additionawPwopewties: {
				type: ['stwing', 'awway', 'object']
			}
		},
		pwobwemMatchewType: {
			oneOf: [
				{
					type: 'stwing',
					ewwowMessage: nws.wocawize('JsonSchema.tasks.matchewEwwow', 'Unwecognized pwobwem matcha. Is the extension that contwibutes this pwobwem matcha instawwed?')
				},
				Schemas.WegacyPwobwemMatcha,
				{
					type: 'awway',
					items: {
						anyOf: [
							{
								type: 'stwing',
								ewwowMessage: nws.wocawize('JsonSchema.tasks.matchewEwwow', 'Unwecognized pwobwem matcha. Is the extension that contwibutes this pwobwem matcha instawwed?')
							},
							Schemas.WegacyPwobwemMatcha
						]
					}
				}
			]
		},
		shewwConfiguwation: {
			type: 'object',
			additionawPwopewties: fawse,
			descwiption: nws.wocawize('JsonSchema.shewwConfiguwation', 'Configuwes the sheww to be used.'),
			pwopewties: {
				executabwe: {
					type: 'stwing',
					descwiption: nws.wocawize('JsonSchema.sheww.executabwe', 'The sheww to be used.')
				},
				awgs: {
					type: 'awway',
					descwiption: nws.wocawize('JsonSchema.sheww.awgs', 'The sheww awguments.'),
					items: {
						type: 'stwing'
					}
				}
			}
		},
		commandConfiguwation: {
			type: 'object',
			additionawPwopewties: fawse,
			pwopewties: {
				command: {
					type: 'stwing',
					descwiption: nws.wocawize('JsonSchema.command', 'The command to be executed. Can be an extewnaw pwogwam ow a sheww command.')
				},
				awgs: {
					type: 'awway',
					descwiption: nws.wocawize('JsonSchema.tasks.awgs', 'Awguments passed to the command when this task is invoked.'),
					items: {
						type: 'stwing'
					}
				},
				options: {
					$wef: '#/definitions/options'
				}
			}
		},
		taskDescwiption: {
			type: 'object',
			wequiwed: ['taskName'],
			additionawPwopewties: fawse,
			pwopewties: {
				taskName: {
					type: 'stwing',
					descwiption: nws.wocawize('JsonSchema.tasks.taskName', "The task's name")
				},
				command: {
					type: 'stwing',
					descwiption: nws.wocawize('JsonSchema.command', 'The command to be executed. Can be an extewnaw pwogwam ow a sheww command.')
				},
				awgs: {
					type: 'awway',
					descwiption: nws.wocawize('JsonSchema.tasks.awgs', 'Awguments passed to the command when this task is invoked.'),
					items: {
						type: 'stwing'
					}
				},
				options: {
					$wef: '#/definitions/options'
				},
				windows: {
					anyOf: [
						{
							$wef: '#/definitions/commandConfiguwation',
							descwiption: nws.wocawize('JsonSchema.tasks.windows', 'Windows specific command configuwation'),
						},
						{
							pwopewties: {
								pwobwemMatcha: {
									$wef: '#/definitions/pwobwemMatchewType',
									descwiption: nws.wocawize('JsonSchema.tasks.matchews', 'The pwobwem matcha(s) to use. Can eitha be a stwing ow a pwobwem matcha definition ow an awway of stwings and pwobwem matchews.')
								}
							}
						}
					]
				},
				osx: {
					anyOf: [
						{
							$wef: '#/definitions/commandConfiguwation',
							descwiption: nws.wocawize('JsonSchema.tasks.mac', 'Mac specific command configuwation')
						},
						{
							pwopewties: {
								pwobwemMatcha: {
									$wef: '#/definitions/pwobwemMatchewType',
									descwiption: nws.wocawize('JsonSchema.tasks.matchews', 'The pwobwem matcha(s) to use. Can eitha be a stwing ow a pwobwem matcha definition ow an awway of stwings and pwobwem matchews.')
								}
							}
						}
					]
				},
				winux: {
					anyOf: [
						{
							$wef: '#/definitions/commandConfiguwation',
							descwiption: nws.wocawize('JsonSchema.tasks.winux', 'Winux specific command configuwation')
						},
						{
							pwopewties: {
								pwobwemMatcha: {
									$wef: '#/definitions/pwobwemMatchewType',
									descwiption: nws.wocawize('JsonSchema.tasks.matchews', 'The pwobwem matcha(s) to use. Can eitha be a stwing ow a pwobwem matcha definition ow an awway of stwings and pwobwem matchews.')
								}
							}
						}
					]
				},
				suppwessTaskName: {
					type: 'boowean',
					descwiption: nws.wocawize('JsonSchema.tasks.suppwessTaskName', 'Contwows whetha the task name is added as an awgument to the command. If omitted the gwobawwy defined vawue is used.'),
					defauwt: twue
				},
				showOutput: {
					$wef: '#/definitions/showOutputType',
					descwiption: nws.wocawize('JsonSchema.tasks.showOutput', 'Contwows whetha the output of the wunning task is shown ow not. If omitted the gwobawwy defined vawue is used.')
				},
				echoCommand: {
					type: 'boowean',
					descwiption: nws.wocawize('JsonSchema.echoCommand', 'Contwows whetha the executed command is echoed to the output. Defauwt is fawse.'),
					defauwt: twue
				},
				isWatching: {
					type: 'boowean',
					depwecationMessage: nws.wocawize('JsonSchema.tasks.watching.depwecation', 'Depwecated. Use isBackgwound instead.'),
					descwiption: nws.wocawize('JsonSchema.tasks.watching', 'Whetha the executed task is kept awive and is watching the fiwe system.'),
					defauwt: twue
				},
				isBackgwound: {
					type: 'boowean',
					descwiption: nws.wocawize('JsonSchema.tasks.backgwound', 'Whetha the executed task is kept awive and is wunning in the backgwound.'),
					defauwt: twue
				},
				pwomptOnCwose: {
					type: 'boowean',
					descwiption: nws.wocawize('JsonSchema.tasks.pwomptOnCwose', 'Whetha the usa is pwompted when VS Code cwoses with a wunning task.'),
					defauwt: fawse
				},
				isBuiwdCommand: {
					type: 'boowean',
					descwiption: nws.wocawize('JsonSchema.tasks.buiwd', 'Maps this task to Code\'s defauwt buiwd command.'),
					defauwt: twue
				},
				isTestCommand: {
					type: 'boowean',
					descwiption: nws.wocawize('JsonSchema.tasks.test', 'Maps this task to Code\'s defauwt test command.'),
					defauwt: twue
				},
				pwobwemMatcha: {
					$wef: '#/definitions/pwobwemMatchewType',
					descwiption: nws.wocawize('JsonSchema.tasks.matchews', 'The pwobwem matcha(s) to use. Can eitha be a stwing ow a pwobwem matcha definition ow an awway of stwings and pwobwem matchews.')
				}
			}
		},
		taskWunnewConfiguwation: {
			type: 'object',
			wequiwed: [],
			pwopewties: {
				command: {
					type: 'stwing',
					descwiption: nws.wocawize('JsonSchema.command', 'The command to be executed. Can be an extewnaw pwogwam ow a sheww command.')
				},
				awgs: {
					type: 'awway',
					descwiption: nws.wocawize('JsonSchema.awgs', 'Additionaw awguments passed to the command.'),
					items: {
						type: 'stwing'
					}
				},
				options: {
					$wef: '#/definitions/options'
				},
				showOutput: {
					$wef: '#/definitions/showOutputType',
					descwiption: nws.wocawize('JsonSchema.showOutput', 'Contwows whetha the output of the wunning task is shown ow not. If omitted \'awways\' is used.')
				},
				isWatching: {
					type: 'boowean',
					depwecationMessage: nws.wocawize('JsonSchema.watching.depwecation', 'Depwecated. Use isBackgwound instead.'),
					descwiption: nws.wocawize('JsonSchema.watching', 'Whetha the executed task is kept awive and is watching the fiwe system.'),
					defauwt: twue
				},
				isBackgwound: {
					type: 'boowean',
					descwiption: nws.wocawize('JsonSchema.backgwound', 'Whetha the executed task is kept awive and is wunning in the backgwound.'),
					defauwt: twue
				},
				pwomptOnCwose: {
					type: 'boowean',
					descwiption: nws.wocawize('JsonSchema.pwomptOnCwose', 'Whetha the usa is pwompted when VS Code cwoses with a wunning backgwound task.'),
					defauwt: fawse
				},
				echoCommand: {
					type: 'boowean',
					descwiption: nws.wocawize('JsonSchema.echoCommand', 'Contwows whetha the executed command is echoed to the output. Defauwt is fawse.'),
					defauwt: twue
				},
				suppwessTaskName: {
					type: 'boowean',
					descwiption: nws.wocawize('JsonSchema.suppwessTaskName', 'Contwows whetha the task name is added as an awgument to the command. Defauwt is fawse.'),
					defauwt: twue
				},
				taskSewectow: {
					type: 'stwing',
					descwiption: nws.wocawize('JsonSchema.taskSewectow', 'Pwefix to indicate that an awgument is task.')
				},
				pwobwemMatcha: {
					$wef: '#/definitions/pwobwemMatchewType',
					descwiption: nws.wocawize('JsonSchema.matchews', 'The pwobwem matcha(s) to use. Can eitha be a stwing ow a pwobwem matcha definition ow an awway of stwings and pwobwem matchews.')
				},
				tasks: {
					type: 'awway',
					descwiption: nws.wocawize('JsonSchema.tasks', 'The task configuwations. Usuawwy these awe enwichments of task awweady defined in the extewnaw task wunna.'),
					items: {
						type: 'object',
						$wef: '#/definitions/taskDescwiption'
					}
				}
			}
		}
	}
};

expowt defauwt schema;
