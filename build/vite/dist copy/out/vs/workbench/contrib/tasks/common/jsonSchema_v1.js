/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import * as Objects from '../../../../base/common/objects.js';
import { ProblemMatcherRegistry } from './problemMatcher.js';
import commonSchema from './jsonSchemaCommon.js';
const schema = {
    oneOf: [
        {
            allOf: [
                {
                    type: 'object',
                    required: ['version'],
                    properties: {
                        version: {
                            type: 'string',
                            enum: ['0.1.0'],
                            deprecationMessage: nls.localize('JsonSchema.version.deprecated', 'Task version 0.1.0 is deprecated. Please use 2.0.0'),
                            description: nls.localize('JsonSchema.version', 'The config\'s version number')
                        },
                        _runner: {
                            deprecationMessage: nls.localize('JsonSchema._runner', 'The runner has graduated. Use the official runner property')
                        },
                        runner: {
                            type: 'string',
                            enum: ['process', 'terminal'],
                            default: 'process',
                            description: nls.localize('JsonSchema.runner', 'Defines whether the task is executed as a process and the output is shown in the output window or inside the terminal.')
                        },
                        windows: {
                            $ref: '#/definitions/taskRunnerConfiguration',
                            description: nls.localize('JsonSchema.windows', 'Windows specific command configuration')
                        },
                        osx: {
                            $ref: '#/definitions/taskRunnerConfiguration',
                            description: nls.localize('JsonSchema.mac', 'Mac specific command configuration')
                        },
                        linux: {
                            $ref: '#/definitions/taskRunnerConfiguration',
                            description: nls.localize('JsonSchema.linux', 'Linux specific command configuration')
                        }
                    }
                },
                {
                    $ref: '#/definitions/taskRunnerConfiguration'
                }
            ]
        }
    ]
};
const shellCommand = {
    type: 'boolean',
    default: true,
    description: nls.localize('JsonSchema.shell', 'Specifies whether the command is a shell command or an external program. Defaults to false if omitted.')
};
schema.definitions = Objects.deepClone(commonSchema.definitions);
const definitions = schema.definitions;
definitions['commandConfiguration']['properties']['isShellCommand'] = Objects.deepClone(shellCommand);
definitions['taskDescription']['properties']['isShellCommand'] = Objects.deepClone(shellCommand);
definitions['taskRunnerConfiguration']['properties']['isShellCommand'] = Objects.deepClone(shellCommand);
Object.getOwnPropertyNames(definitions).forEach(key => {
    const newKey = key + '1';
    definitions[newKey] = definitions[key];
    delete definitions[key];
});
function fixReferences(literal) {
    if (Array.isArray(literal)) {
        literal.forEach(element => {
            if (typeof element === 'object' && element !== null) {
                fixReferences(element);
            }
        });
    }
    else if (typeof literal === 'object') {
        if (literal['$ref']) {
            literal['$ref'] = literal['$ref'] + '1';
        }
        Object.getOwnPropertyNames(literal).forEach(property => {
            const value = literal[property];
            if (Array.isArray(value) || typeof value === 'object') {
                fixReferences(value);
            }
        });
    }
}
fixReferences(schema);
ProblemMatcherRegistry.onReady().then(() => {
    try {
        const matcherIds = ProblemMatcherRegistry.keys().map(key => '$' + key);
        definitions.problemMatcherType1.oneOf[0].enum = matcherIds;
        definitions.problemMatcherType1.oneOf[2].items.anyOf[1].enum = matcherIds;
    }
    catch (err) {
        console.log('Installing problem matcher ids failed');
    }
});
export default schema;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvblNjaGVtYV92MS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi9qc29uU2NoZW1hX3YxLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUc5RCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUU3RCxPQUFPLFlBQVksTUFBTSx1QkFBdUIsQ0FBQztBQUVqRCxNQUFNLE1BQU0sR0FBZ0I7SUFDM0IsS0FBSyxFQUFFO1FBQ047WUFDQyxLQUFLLEVBQUU7Z0JBQ047b0JBQ0MsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsUUFBUSxFQUFFLENBQUMsU0FBUyxDQUFDO29CQUNyQixVQUFVLEVBQUU7d0JBQ1gsT0FBTyxFQUFFOzRCQUNSLElBQUksRUFBRSxRQUFROzRCQUNkLElBQUksRUFBRSxDQUFDLE9BQU8sQ0FBQzs0QkFDZixrQkFBa0IsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLCtCQUErQixFQUFFLG9EQUFvRCxDQUFDOzRCQUN2SCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSw4QkFBOEIsQ0FBQzt5QkFDL0U7d0JBQ0QsT0FBTyxFQUFFOzRCQUNSLGtCQUFrQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsNERBQTRELENBQUM7eUJBQ3BIO3dCQUNELE1BQU0sRUFBRTs0QkFDUCxJQUFJLEVBQUUsUUFBUTs0QkFDZCxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDOzRCQUM3QixPQUFPLEVBQUUsU0FBUzs0QkFDbEIsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENB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