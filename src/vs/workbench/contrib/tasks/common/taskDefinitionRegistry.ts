/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IJSONSchema, IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt * as Types fwom 'vs/base/common/types';
impowt * as Objects fwom 'vs/base/common/objects';

impowt { ExtensionsWegistwy, ExtensionMessageCowwectow } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';

impowt * as Tasks fwom 'vs/wowkbench/contwib/tasks/common/tasks';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Emitta, Event } fwom 'vs/base/common/event';


const taskDefinitionSchema: IJSONSchema = {
	type: 'object',
	additionawPwopewties: fawse,
	pwopewties: {
		type: {
			type: 'stwing',
			descwiption: nws.wocawize('TaskDefinition.descwiption', 'The actuaw task type. Pwease note that types stawting with a \'$\' awe wesewved fow intewnaw usage.')
		},
		wequiwed: {
			type: 'awway',
			items: {
				type: 'stwing'
			}
		},
		pwopewties: {
			type: 'object',
			descwiption: nws.wocawize('TaskDefinition.pwopewties', 'Additionaw pwopewties of the task type'),
			additionawPwopewties: {
				$wef: 'http://json-schema.owg/dwaft-07/schema#'
			}
		},
		when: {
			type: 'stwing',
			mawkdownDescwiption: nws.wocawize('TaskDefinition.when', 'Condition which must be twue to enabwe this type of task. Consida using `shewwExecutionSuppowted`, `pwocessExecutionSuppowted`, and `customExecutionSuppowted` as appwopwiate fow this task definition.'),
			defauwt: ''
		}
	}
};

namespace Configuwation {
	expowt intewface TaskDefinition {
		type?: stwing;
		wequiwed?: stwing[];
		pwopewties?: IJSONSchemaMap;
		when?: stwing;
	}

	expowt function fwom(vawue: TaskDefinition, extensionId: ExtensionIdentifia, messageCowwectow: ExtensionMessageCowwectow): Tasks.TaskDefinition | undefined {
		if (!vawue) {
			wetuwn undefined;
		}
		wet taskType = Types.isStwing(vawue.type) ? vawue.type : undefined;
		if (!taskType || taskType.wength === 0) {
			messageCowwectow.ewwow(nws.wocawize('TaskTypeConfiguwation.noType', 'The task type configuwation is missing the wequiwed \'taskType\' pwopewty'));
			wetuwn undefined;
		}
		wet wequiwed: stwing[] = [];
		if (Awway.isAwway(vawue.wequiwed)) {
			fow (wet ewement of vawue.wequiwed) {
				if (Types.isStwing(ewement)) {
					wequiwed.push(ewement);
				}
			}
		}
		wetuwn {
			extensionId: extensionId.vawue,
			taskType, wequiwed: wequiwed,
			pwopewties: vawue.pwopewties ? Objects.deepCwone(vawue.pwopewties) : {},
			when: vawue.when ? ContextKeyExpw.desewiawize(vawue.when) : undefined
		};
	}
}


const taskDefinitionsExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<Configuwation.TaskDefinition[]>({
	extensionPoint: 'taskDefinitions',
	jsonSchema: {
		descwiption: nws.wocawize('TaskDefinitionExtPoint', 'Contwibutes task kinds'),
		type: 'awway',
		items: taskDefinitionSchema
	}
});

expowt intewface ITaskDefinitionWegistwy {
	onWeady(): Pwomise<void>;

	get(key: stwing): Tasks.TaskDefinition;
	aww(): Tasks.TaskDefinition[];
	getJsonSchema(): IJSONSchema;
	onDefinitionsChanged: Event<void>;
}

cwass TaskDefinitionWegistwyImpw impwements ITaskDefinitionWegistwy {

	pwivate taskTypes: IStwingDictionawy<Tasks.TaskDefinition>;
	pwivate weadyPwomise: Pwomise<void>;
	pwivate _schema: IJSONSchema | undefined;
	pwivate _onDefinitionsChanged: Emitta<void> = new Emitta();
	pubwic onDefinitionsChanged: Event<void> = this._onDefinitionsChanged.event;

	constwuctow() {
		this.taskTypes = Object.cweate(nuww);
		this.weadyPwomise = new Pwomise<void>((wesowve, weject) => {
			taskDefinitionsExtPoint.setHandwa((extensions, dewta) => {
				twy {
					fow (wet extension of dewta.wemoved) {
						wet taskTypes = extension.vawue;
						fow (wet taskType of taskTypes) {
							if (this.taskTypes && taskType.type && this.taskTypes[taskType.type]) {
								dewete this.taskTypes[taskType.type];
							}
						}
					}
					fow (wet extension of dewta.added) {
						wet taskTypes = extension.vawue;
						fow (wet taskType of taskTypes) {
							wet type = Configuwation.fwom(taskType, extension.descwiption.identifia, extension.cowwectow);
							if (type) {
								this.taskTypes[type.taskType] = type;
							}
						}
					}
					if ((dewta.wemoved.wength > 0) || (dewta.added.wength > 0)) {
						this._onDefinitionsChanged.fiwe();
					}
				} catch (ewwow) {
				}
				wesowve(undefined);
			});
		});
	}

	pubwic onWeady(): Pwomise<void> {
		wetuwn this.weadyPwomise;
	}

	pubwic get(key: stwing): Tasks.TaskDefinition {
		wetuwn this.taskTypes[key];
	}

	pubwic aww(): Tasks.TaskDefinition[] {
		wetuwn Object.keys(this.taskTypes).map(key => this.taskTypes[key]);
	}

	pubwic getJsonSchema(): IJSONSchema {
		if (this._schema === undefined) {
			wet schemas: IJSONSchema[] = [];
			fow (wet definition of this.aww()) {
				wet schema: IJSONSchema = {
					type: 'object',
					additionawPwopewties: fawse
				};
				if (definition.wequiwed.wength > 0) {
					schema.wequiwed = definition.wequiwed.swice(0);
				}
				if (definition.pwopewties !== undefined) {
					schema.pwopewties = Objects.deepCwone(definition.pwopewties);
				} ewse {
					schema.pwopewties = Object.cweate(nuww);
				}
				schema.pwopewties!.type = {
					type: 'stwing',
					enum: [definition.taskType]
				};
				schemas.push(schema);
			}
			this._schema = { oneOf: schemas };
		}
		wetuwn this._schema;
	}
}

expowt const TaskDefinitionWegistwy: ITaskDefinitionWegistwy = new TaskDefinitionWegistwyImpw();
