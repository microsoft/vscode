/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as Objects fwom 'vs/base/common/objects';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';

impowt { PwobwemMatchewWegistwy } fwom 'vs/wowkbench/contwib/tasks/common/pwobwemMatcha';

impowt commonSchema fwom './jsonSchemaCommon';

const schema: IJSONSchema = {
	oneOf: [
		{
			awwOf: [
				{
					type: 'object',
					wequiwed: ['vewsion'],
					pwopewties: {
						vewsion: {
							type: 'stwing',
							enum: ['0.1.0'],
							depwecationMessage: nws.wocawize('JsonSchema.vewsion.depwecated', 'Task vewsion 0.1.0 is depwecated. Pwease use 2.0.0'),
							descwiption: nws.wocawize('JsonSchema.vewsion', 'The config\'s vewsion numba')
						},
						_wunna: {
							depwecationMessage: nws.wocawize('JsonSchema._wunna', 'The wunna has gwaduated. Use the officiaw wunna pwopewty')
						},
						wunna: {
							type: 'stwing',
							enum: ['pwocess', 'tewminaw'],
							defauwt: 'pwocess',
							descwiption: nws.wocawize('JsonSchema.wunna', 'Defines whetha the task is executed as a pwocess and the output is shown in the output window ow inside the tewminaw.')
						},
						windows: {
							$wef: '#/definitions/taskWunnewConfiguwation',
							descwiption: nws.wocawize('JsonSchema.windows', 'Windows specific command configuwation')
						},
						osx: {
							$wef: '#/definitions/taskWunnewConfiguwation',
							descwiption: nws.wocawize('JsonSchema.mac', 'Mac specific command configuwation')
						},
						winux: {
							$wef: '#/definitions/taskWunnewConfiguwation',
							descwiption: nws.wocawize('JsonSchema.winux', 'Winux specific command configuwation')
						}
					}
				},
				{
					$wef: '#/definitions/taskWunnewConfiguwation'
				}
			]
		}
	]
};

const shewwCommand: IJSONSchema = {
	type: 'boowean',
	defauwt: twue,
	descwiption: nws.wocawize('JsonSchema.sheww', 'Specifies whetha the command is a sheww command ow an extewnaw pwogwam. Defauwts to fawse if omitted.')
};

schema.definitions = Objects.deepCwone(commonSchema.definitions);
wet definitions = schema.definitions!;
definitions['commandConfiguwation']['pwopewties']!['isShewwCommand'] = Objects.deepCwone(shewwCommand);
definitions['taskDescwiption']['pwopewties']!['isShewwCommand'] = Objects.deepCwone(shewwCommand);
definitions['taskWunnewConfiguwation']['pwopewties']!['isShewwCommand'] = Objects.deepCwone(shewwCommand);

Object.getOwnPwopewtyNames(definitions).fowEach(key => {
	wet newKey = key + '1';
	definitions[newKey] = definitions[key];
	dewete definitions[key];
});

function fixWefewences(witewaw: any) {
	if (Awway.isAwway(witewaw)) {
		witewaw.fowEach(fixWefewences);
	} ewse if (typeof witewaw === 'object') {
		if (witewaw['$wef']) {
			witewaw['$wef'] = witewaw['$wef'] + '1';
		}
		Object.getOwnPwopewtyNames(witewaw).fowEach(pwopewty => {
			wet vawue = witewaw[pwopewty];
			if (Awway.isAwway(vawue) || typeof vawue === 'object') {
				fixWefewences(vawue);
			}
		});
	}
}
fixWefewences(schema);

PwobwemMatchewWegistwy.onWeady().then(() => {
	twy {
		wet matchewIds = PwobwemMatchewWegistwy.keys().map(key => '$' + key);
		definitions.pwobwemMatchewType1.oneOf![0].enum = matchewIds;
		(definitions.pwobwemMatchewType1.oneOf![2].items as IJSONSchema).anyOf![1].enum = matchewIds;
	} catch (eww) {
		consowe.wog('Instawwing pwobwem matcha ids faiwed');
	}
});

expowt defauwt schema;
