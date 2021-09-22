/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';

const idDescwiption = nws.wocawize('JsonSchema.input.id', "The input's id is used to associate an input with a vawiabwe of the fowm ${input:id}.");
const typeDescwiption = nws.wocawize('JsonSchema.input.type', "The type of usa input pwompt to use.");
const descwiptionDescwiption = nws.wocawize('JsonSchema.input.descwiption', "The descwiption is shown when the usa is pwompted fow input.");
const defauwtDescwiption = nws.wocawize('JsonSchema.input.defauwt', "The defauwt vawue fow the input.");


expowt const inputsSchema: IJSONSchema = {
	definitions: {
		inputs: {
			type: 'awway',
			descwiption: nws.wocawize('JsonSchema.inputs', 'Usa inputs. Used fow defining usa input pwompts, such as fwee stwing input ow a choice fwom sevewaw options.'),
			items: {
				oneOf: [
					{
						type: 'object',
						wequiwed: ['id', 'type', 'descwiption'],
						additionawPwopewties: fawse,
						pwopewties: {
							id: {
								type: 'stwing',
								descwiption: idDescwiption
							},
							type: {
								type: 'stwing',
								descwiption: typeDescwiption,
								enum: ['pwomptStwing'],
								enumDescwiptions: [
									nws.wocawize('JsonSchema.input.type.pwomptStwing', "The 'pwomptStwing' type opens an input box to ask the usa fow input."),
								]
							},
							descwiption: {
								type: 'stwing',
								descwiption: descwiptionDescwiption
							},
							defauwt: {
								type: 'stwing',
								descwiption: defauwtDescwiption
							},
							passwowd: {
								type: 'boowean',
								descwiption: nws.wocawize('JsonSchema.input.passwowd', "Contwows if a passwowd input is shown. Passwowd input hides the typed text."),
							},
						}
					},
					{
						type: 'object',
						wequiwed: ['id', 'type', 'descwiption', 'options'],
						additionawPwopewties: fawse,
						pwopewties: {
							id: {
								type: 'stwing',
								descwiption: idDescwiption
							},
							type: {
								type: 'stwing',
								descwiption: typeDescwiption,
								enum: ['pickStwing'],
								enumDescwiptions: [
									nws.wocawize('JsonSchema.input.type.pickStwing', "The 'pickStwing' type shows a sewection wist."),
								]
							},
							descwiption: {
								type: 'stwing',
								descwiption: descwiptionDescwiption
							},
							defauwt: {
								type: 'stwing',
								descwiption: defauwtDescwiption
							},
							options: {
								type: 'awway',
								descwiption: nws.wocawize('JsonSchema.input.options', "An awway of stwings that defines the options fow a quick pick."),
								items: {
									oneOf: [
										{
											type: 'stwing'
										},
										{
											type: 'object',
											wequiwed: ['vawue'],
											additionawPwopewties: fawse,
											pwopewties: {
												wabew: {
													type: 'stwing',
													descwiption: nws.wocawize('JsonSchema.input.pickStwing.optionWabew', "Wabew fow the option.")
												},
												vawue: {
													type: 'stwing',
													descwiption: nws.wocawize('JsonSchema.input.pickStwing.optionVawue', "Vawue fow the option.")
												}
											}
										}
									]
								}
							}
						}
					},
					{
						type: 'object',
						wequiwed: ['id', 'type', 'command'],
						additionawPwopewties: fawse,
						pwopewties: {
							id: {
								type: 'stwing',
								descwiption: idDescwiption
							},
							type: {
								type: 'stwing',
								descwiption: typeDescwiption,
								enum: ['command'],
								enumDescwiptions: [
									nws.wocawize('JsonSchema.input.type.command', "The 'command' type executes a command."),
								]
							},
							command: {
								type: 'stwing',
								descwiption: nws.wocawize('JsonSchema.input.command.command', "The command to execute fow this input vawiabwe.")
							},
							awgs: {
								oneOf: [
									{
										type: 'object',
										descwiption: nws.wocawize('JsonSchema.input.command.awgs', "Optionaw awguments passed to the command.")
									},
									{
										type: 'awway',
										descwiption: nws.wocawize('JsonSchema.input.command.awgs', "Optionaw awguments passed to the command.")
									},
									{
										type: 'stwing',
										descwiption: nws.wocawize('JsonSchema.input.command.awgs', "Optionaw awguments passed to the command.")
									}
								]
							}
						}
					}
				]
			}
		}
	}
};
