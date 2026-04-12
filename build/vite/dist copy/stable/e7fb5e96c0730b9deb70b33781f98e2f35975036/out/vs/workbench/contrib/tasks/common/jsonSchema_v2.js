/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import * as Objects from '../../../../base/common/objects.js';
import commonSchema from './jsonSchemaCommon.js';
import { ProblemMatcherRegistry } from './problemMatcher.js';
import { TaskDefinitionRegistry } from './taskDefinitionRegistry.js';
import * as ConfigurationResolverUtils from '../../../services/configurationResolver/common/configurationResolverUtils.js';
import { inputsSchema } from '../../../services/configurationResolver/common/configurationResolverSchema.js';
import { getAllCodicons } from '../../../../base/common/codicons.js';
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
            literal['$ref'] = literal['$ref'] + '2';
        }
        Object.getOwnPropertyNames(literal).forEach(property => {
            const value = literal[property];
            if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
                fixReferences(value);
            }
        });
    }
}
const shellCommand = {
    anyOf: [
        {
            type: 'boolean',
            default: true,
            description: nls.localize('JsonSchema.shell', 'Specifies whether the command is a shell command or an external program. Defaults to false if omitted.')
        },
        {
            $ref: '#/definitions/shellConfiguration'
        }
    ],
    deprecationMessage: nls.localize('JsonSchema.tasks.isShellCommand.deprecated', 'The property isShellCommand is deprecated. Use the type property of the task and the shell property in the options instead. See also the 1.14 release notes.')
};
const hide = {
    type: 'boolean',
    description: nls.localize('JsonSchema.hide', 'Hide this task from the run task quick pick'),
    default: true
};
const inSessions = {
    type: 'boolean',
    description: nls.localize('JsonSchema.inSessions', 'Show this task in the Agent Sessions run action dropdown'),
    default: false
};
const taskIdentifier = {
    type: 'object',
    additionalProperties: true,
    properties: {
        type: {
            type: 'string',
            description: nls.localize('JsonSchema.tasks.dependsOn.identifier', 'The task identifier.')
        }
    }
};
const dependsOn = {
    anyOf: [
        {
            type: 'string',
            description: nls.localize('JsonSchema.tasks.dependsOn.string', 'Another task this task depends on.')
        },
        taskIdentifier,
        {
            type: 'array',
            description: nls.localize('JsonSchema.tasks.dependsOn.array', 'The other tasks this task depends on.'),
            items: {
                anyOf: [
                    {
                        type: 'string',
                    },
                    taskIdentifier
                ]
            }
        }
    ],
    description: nls.localize('JsonSchema.tasks.dependsOn', 'Either a string representing another task or an array of other tasks that this task depends on.')
};
const dependsOrder = {
    type: 'string',
    enum: ['parallel', 'sequence'],
    enumDescriptions: [
        nls.localize('JsonSchema.tasks.dependsOrder.parallel', 'Run all dependsOn tasks in parallel.'),
        nls.localize('JsonSchema.tasks.dependsOrder.sequence', 'Run all dependsOn tasks in sequence.'),
    ],
    default: 'parallel',
    description: nls.localize('JsonSchema.tasks.dependsOrder', 'Determines the order of the dependsOn tasks for this task. Note that this property is not recursive.')
};
const detail = {
    type: 'string',
    description: nls.localize('JsonSchema.tasks.detail', 'An optional description of a task that shows in the Run Task quick pick as a detail.')
};
const icon = {
    type: 'object',
    description: nls.localize('JsonSchema.tasks.icon', 'An optional icon for the task'),
    properties: {
        id: {
            description: nls.localize('JsonSchema.tasks.icon.id', 'An optional codicon ID to use'),
            type: ['string', 'null'],
            enum: Array.from(getAllCodicons(), icon => icon.id),
            markdownEnumDescriptions: Array.from(getAllCodicons(), icon => `$(${icon.id})`),
        },
        color: {
            description: nls.localize('JsonSchema.tasks.icon.color', 'An optional color of the icon'),
            type: ['string', 'null'],
            enum: [
                'terminal.ansiBlack',
                'terminal.ansiRed',
                'terminal.ansiGreen',
                'terminal.ansiYellow',
                'terminal.ansiBlue',
                'terminal.ansiMagenta',
                'terminal.ansiCyan',
                'terminal.ansiWhite'
            ],
        },
    }
};
const presentation = {
    type: 'object',
    default: {
        echo: true,
        reveal: 'always',
        focus: false,
        panel: 'shared',
        showReuseMessage: true,
        clear: false,
    },
    description: nls.localize('JsonSchema.tasks.presentation', 'Configures the panel that is used to present the task\'s output and reads its input.'),
    additionalProperties: false,
    properties: {
        echo: {
            type: 'boolean',
            default: true,
            description: nls.localize('JsonSchema.tasks.presentation.echo', 'Controls whether the executed command is echoed to the panel. Default is true.')
        },
        focus: {
            type: 'boolean',
            default: false,
            description: nls.localize('JsonSchema.tasks.presentation.focus', 'Controls whether the panel takes focus. Default is false. If set to true the panel is revealed as well.')
        },
        revealProblems: {
            type: 'string',
            enum: ['always', 'onProblem', 'never'],
            enumDescriptions: [
                nls.localize('JsonSchema.tasks.presentation.revealProblems.always', 'Always reveals the problems panel when this task is executed.'),
                nls.localize('JsonSchema.tasks.presentation.revealProblems.onProblem', 'Only reveals the problems panel if a problem is found.'),
                nls.localize('JsonSchema.tasks.presentation.revealProblems.never', 'Never reveals the problems panel when this task is executed.'),
            ],
            default: 'never',
            description: nls.localize('JsonSchema.tasks.presentation.revealProblems', 'Controls whether the problems panel is revealed when running this task or not. Takes precedence over option \"reveal\". Default is \"never\".')
        },
        reveal: {
            type: 'string',
            enum: ['always', 'silent', 'never'],
            enumDescriptions: [
                nls.localize('JsonSchema.tasks.presentation.reveal.always', 'Always reveals the terminal when this task is executed.'),
                nls.localize('JsonSchema.tasks.presentation.reveal.silent', 'Only reveals the terminal if the task exits with an error or the problem matcher finds an error.'),
                nls.localize('JsonSchema.tasks.presentation.reveal.never', 'Never reveals the terminal when this task is executed.'),
            ],
            default: 'always',
            description: nls.localize('JsonSchema.tasks.presentation.reveal', 'Controls whether the terminal running the task is revealed or not. May be overridden by option \"revealProblems\". Default is \"always\".')
        },
        panel: {
            type: 'string',
            enum: ['shared', 'dedicated', 'new'],
            default: 'shared',
            description: nls.localize('JsonSchema.tasks.presentation.instance', 'Controls if the panel is shared between tasks, dedicated to this task or a new one is created on every run.')
        },
        showReuseMessage: {
            type: 'boolean',
            default: true,
            description: nls.localize('JsonSchema.tasks.presentation.showReuseMessage', 'Controls whether to show the `Terminal will be reused by tasks, press any key to close it` message.')
        },
        clear: {
            type: 'boolean',
            default: false,
            description: nls.localize('JsonSchema.tasks.presentation.clear', 'Controls whether the terminal is cleared before executing the task.')
        },
        group: {
            type: 'string',
            description: nls.localize('JsonSchema.tasks.presentation.group', 'Controls whether the task is executed in a specific terminal group using split panes.')
        },
        close: {
            type: 'boolean',
            description: nls.localize('JsonSchema.tasks.presentation.close', 'Controls whether the terminal the task runs in is closed when the task exits.')
        },
        preserveTerminalName: {
            type: 'boolean',
            default: false,
            description: nls.localize('JsonSchema.tasks.presentation.preserveTerminalName', 'Controls whether to preserve the task name in the terminal after task completion.')
        }
    }
};
const terminal = Objects.deepClone(presentation);
terminal.deprecationMessage = nls.localize('JsonSchema.tasks.terminal', 'The terminal property is deprecated. Use presentation instead');
const groupStrings = {
    type: 'string',
    enum: [
        'build',
        'test',
        'none'
    ],
    enumDescriptions: [
        nls.localize('JsonSchema.tasks.group.build', 'Marks the task as a build task accessible through the \'Run Build Task\' command.'),
        nls.localize('JsonSchema.tasks.group.test', 'Marks the task as a test task accessible through the \'Run Test Task\' command.'),
        nls.localize('JsonSchema.tasks.group.none', 'Assigns the task to no group')
    ],
    description: nls.localize('JsonSchema.tasks.group.kind', 'The task\'s execution group.')
};
const group = {
    oneOf: [
        groupStrings,
        {
            type: 'object',
            properties: {
                kind: groupStrings,
                isDefault: {
                    type: ['boolean', 'string'],
                    default: false,
                    description: nls.localize('JsonSchema.tasks.group.isDefault', 'Defines if this task is the default task in the group, or a glob to match the file which should trigger this task.')
                }
            }
        },
    ],
    defaultSnippets: [
        {
            body: { kind: 'build', isDefault: true },
            description: nls.localize('JsonSchema.tasks.group.defaultBuild', 'Marks the task as the default build task.')
        },
        {
            body: { kind: 'test', isDefault: true },
            description: nls.localize('JsonSchema.tasks.group.defaultTest', 'Marks the task as the default test task.')
        }
    ],
    description: nls.localize('JsonSchema.tasks.group', 'Defines to which execution group this task belongs to. It supports "build" to add it to the build group and "test" to add it to the test group.')
};
const taskType = {
    type: 'string',
    enum: ['shell'],
    default: 'process',
    description: nls.localize('JsonSchema.tasks.type', 'Defines whether the task is run as a process or as a command inside a shell.')
};
const command = {
    oneOf: [
        {
            oneOf: [
                {
                    type: 'string'
                },
                {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: nls.localize('JsonSchema.commandArray', 'The shell command to be executed. Array items will be joined using a space character')
                }
            ]
        },
        {
            type: 'object',
            required: ['value', 'quoting'],
            properties: {
                value: {
                    oneOf: [
                        {
                            type: 'string'
                        },
                        {
                            type: 'array',
                            items: {
                                type: 'string'
                            },
                            description: nls.localize('JsonSchema.commandArray', 'The shell command to be executed. Array items will be joined using a space character')
                        }
                    ],
                    description: nls.localize('JsonSchema.command.quotedString.value', 'The actual command value')
                },
                quoting: {
                    type: 'string',
                    enum: ['escape', 'strong', 'weak'],
                    enumDescriptions: [
                        nls.localize('JsonSchema.tasks.quoting.escape', 'Escapes characters using the shell\'s escape character (e.g. ` under PowerShell and \\ under bash).'),
                        nls.localize('JsonSchema.tasks.quoting.strong', 'Quotes the argument using the shell\'s strong quote character (e.g. \' under PowerShell and bash).'),
                        nls.localize('JsonSchema.tasks.quoting.weak', 'Quotes the argument using the shell\'s weak quote character (e.g. " under PowerShell and bash).'),
                    ],
                    default: 'strong',
                    description: nls.localize('JsonSchema.command.quotesString.quote', 'How the command value should be quoted.')
                }
            }
        }
    ],
    description: nls.localize('JsonSchema.command', 'The command to be executed. Can be an external program or a shell command.')
};
const args = {
    type: 'array',
    items: {
        oneOf: [
            {
                type: 'string',
            },
            {
                type: 'object',
                required: ['value', 'quoting'],
                properties: {
                    value: {
                        type: 'string',
                        description: nls.localize('JsonSchema.args.quotedString.value', 'The actual argument value')
                    },
                    quoting: {
                        type: 'string',
                        enum: ['escape', 'strong', 'weak'],
                        enumDescriptions: [
                            nls.localize('JsonSchema.tasks.quoting.escape', 'Escapes characters using the shell\'s escape character (e.g. ` under PowerShell and \\ under bash).'),
                            nls.localize('JsonSchema.tasks.quoting.strong', 'Quotes the argument using the shell\'s strong quote character (e.g. \' under PowerShell and bash).'),
                            nls.localize('JsonSchema.tasks.quoting.weak', 'Quotes the argument using the shell\'s weak quote character (e.g. " under PowerShell and bash).'),
                        ],
                        default: 'strong',
                        description: nls.localize('JsonSchema.args.quotesString.quote', 'How the argument value should be quoted.')
                    }
                }
            }
        ]
    },
    description: nls.localize('JsonSchema.tasks.args', 'Arguments passed to the command when this task is invoked.')
};
const label = {
    type: 'string',
    description: nls.localize('JsonSchema.tasks.label', "The task's user interface label")
};
const version = {
    type: 'string',
    enum: ['2.0.0'],
    description: nls.localize('JsonSchema.version', 'The config\'s version number.')
};
const identifier = {
    type: 'string',
    description: nls.localize('JsonSchema.tasks.identifier', 'A user defined identifier to reference the task in launch.json or a dependsOn clause.'),
    deprecationMessage: nls.localize('JsonSchema.tasks.identifier.deprecated', 'User defined identifiers are deprecated. For custom task use the name as a reference and for tasks provided by extensions use their defined task identifier.')
};
const runOptions = {
    type: 'object',
    additionalProperties: false,
    properties: {
        reevaluateOnRerun: {
            type: 'boolean',
            description: nls.localize('JsonSchema.tasks.reevaluateOnRerun', 'Whether to reevaluate task variables on rerun.'),
            default: true
        },
        runOn: {
            type: 'string',
            enum: ['default', 'folderOpen', 'worktreeCreated'],
            description: nls.localize('JsonSchema.tasks.runOn', 'Configures when the task should be run. If set to folderOpen, then the task will be run automatically when the folder is opened. If set to worktreeCreated, then the task will be run automatically when an Agent Session worktree is created.'),
            default: 'default'
        },
        instanceLimit: {
            type: 'number',
            description: nls.localize('JsonSchema.tasks.instanceLimit', 'The number of instances of the task that are allowed to run simultaneously.'),
            default: 1
        },
        instancePolicy: {
            type: 'string',
            enum: ['terminateNewest', 'terminateOldest', 'prompt', 'warn', 'silent'],
            enumDescriptions: [
                nls.localize('JsonSchema.tasks.instancePolicy.terminateNewest', 'Terminates the newest instance.'),
                nls.localize('JsonSchema.tasks.instancePolicy.terminateOldest', 'Terminates the oldest instance.'),
                nls.localize('JsonSchema.tasks.instancePolicy.prompt', 'Asks which instance to terminate.'),
                nls.localize('JsonSchema.tasks.instancePolicy.warn', 'Does nothing but warns that the instance limit has been reached.'),
                nls.localize('JsonSchema.tasks.instancePolicy.silent', 'Does nothing.'),
            ],
            description: nls.localize('JsonSchema.tasks.instancePolicy', 'Policy to apply when instance limit is reached.'),
            default: 'prompt'
        }
    },
    description: nls.localize('JsonSchema.tasks.runOptions', 'The task\'s run related options')
};
const commonSchemaDefinitions = commonSchema.definitions;
const options = Objects.deepClone(commonSchemaDefinitions.options);
const optionsProperties = options.properties;
optionsProperties.shell = Objects.deepClone(commonSchemaDefinitions.shellConfiguration);
const taskConfiguration = {
    type: 'object',
    additionalProperties: false,
    properties: {
        label: {
            type: 'string',
            description: nls.localize('JsonSchema.tasks.taskLabel', "The task's label")
        },
        taskName: {
            type: 'string',
            description: nls.localize('JsonSchema.tasks.taskName', 'The task\'s name'),
            deprecationMessage: nls.localize('JsonSchema.tasks.taskName.deprecated', 'The task\'s name property is deprecated. Use the label property instead.')
        },
        identifier: Objects.deepClone(identifier),
        group: Objects.deepClone(group),
        isBackground: {
            type: 'boolean',
            description: nls.localize('JsonSchema.tasks.background', 'Whether the executed task is kept alive and is running in the background.'),
            default: true
        },
        promptOnClose: {
            type: 'boolean',
            description: nls.localize('JsonSchema.tasks.promptOnClose', 'Whether the user is prompted when VS Code closes with a running task.'),
            default: false
        },
        presentation: Objects.deepClone(presentation),
        icon: Objects.deepClone(icon),
        hide: Objects.deepClone(hide),
        inSessions: Objects.deepClone(inSessions),
        options: options,
        problemMatcher: {
            $ref: '#/definitions/problemMatcherType',
            description: nls.localize('JsonSchema.tasks.matchers', 'The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.')
        },
        runOptions: Objects.deepClone(runOptions),
        dependsOn: Objects.deepClone(dependsOn),
        dependsOrder: Objects.deepClone(dependsOrder),
        detail: Objects.deepClone(detail),
    }
};
const taskDefinitions = [];
TaskDefinitionRegistry.onReady().then(() => {
    updateTaskDefinitions();
});
export function updateTaskDefinitions() {
    for (const taskType of TaskDefinitionRegistry.all()) {
        // Check that we haven't already added this task type
        if (taskDefinitions.find(schema => {
            return schema.properties?.type?.enum?.find ? schema.properties?.type.enum.find(element => element === taskType.taskType) : undefined;
        })) {
            continue;
        }
        const schema = Objects.deepClone(taskConfiguration);
        const schemaProperties = schema.properties;
        // Since we do this after the schema is assigned we need to patch the refs.
        schemaProperties.type = {
            type: 'string',
            description: nls.localize('JsonSchema.customizations.customizes.type', 'The task type to customize'),
            enum: [taskType.taskType]
        };
        if (taskType.required) {
            schema.required = taskType.required.slice();
        }
        else {
            schema.required = [];
        }
        // Customized tasks require that the task type be set.
        schema.required.push('type');
        if (taskType.properties) {
            for (const key of Object.keys(taskType.properties)) {
                const property = taskType.properties[key];
                schemaProperties[key] = Objects.deepClone(property);
            }
        }
        fixReferences(schema);
        taskDefinitions.push(schema);
    }
}
const customize = Objects.deepClone(taskConfiguration);
customize.properties.customize = {
    type: 'string',
    deprecationMessage: nls.localize('JsonSchema.tasks.customize.deprecated', 'The customize property is deprecated. See the 1.14 release notes on how to migrate to the new task customization approach')
};
if (!customize.required) {
    customize.required = [];
}
customize.required.push('customize');
taskDefinitions.push(customize);
const definitions = Objects.deepClone(commonSchemaDefinitions);
const taskDescription = definitions.taskDescription;
taskDescription.required = ['label'];
const taskDescriptionProperties = taskDescription.properties;
taskDescriptionProperties.label = Objects.deepClone(label);
taskDescriptionProperties.command = Objects.deepClone(command);
taskDescriptionProperties.args = Objects.deepClone(args);
taskDescriptionProperties.isShellCommand = Objects.deepClone(shellCommand);
taskDescriptionProperties.dependsOn = dependsOn;
taskDescriptionProperties.hide = Objects.deepClone(hide);
taskDescriptionProperties.inSessions = Objects.deepClone(inSessions);
taskDescriptionProperties.dependsOrder = dependsOrder;
taskDescriptionProperties.identifier = Objects.deepClone(identifier);
taskDescriptionProperties.type = Objects.deepClone(taskType);
taskDescriptionProperties.presentation = Objects.deepClone(presentation);
taskDescriptionProperties.terminal = terminal;
taskDescriptionProperties.icon = Objects.deepClone(icon);
taskDescriptionProperties.group = Objects.deepClone(group);
taskDescriptionProperties.runOptions = Objects.deepClone(runOptions);
taskDescriptionProperties.detail = detail;
taskDescriptionProperties.taskName.deprecationMessage = nls.localize('JsonSchema.tasks.taskName.deprecated', 'The task\'s name property is deprecated. Use the label property instead.');
// Clone the taskDescription for process task before setting a default to prevent two defaults #115281
const processTask = Objects.deepClone(taskDescription);
taskDescription.default = {
    label: 'My Task',
    type: 'shell',
    command: 'echo Hello',
    problemMatcher: []
};
definitions.showOutputType.deprecationMessage = nls.localize('JsonSchema.tasks.showOutput.deprecated', 'The property showOutput is deprecated. Use the reveal property inside the presentation property instead. See also the 1.14 release notes.');
taskDescriptionProperties.echoCommand.deprecationMessage = nls.localize('JsonSchema.tasks.echoCommand.deprecated', 'The property echoCommand is deprecated. Use the echo property inside the presentation property instead. See also the 1.14 release notes.');
taskDescriptionProperties.suppressTaskName.deprecationMessage = nls.localize('JsonSchema.tasks.suppressTaskName.deprecated', 'The property suppressTaskName is deprecated. Inline the command with its arguments into the task instead. See also the 1.14 release notes.');
taskDescriptionProperties.isBuildCommand.deprecationMessage = nls.localize('JsonSchema.tasks.isBuildCommand.deprecated', 'The property isBuildCommand is deprecated. Use the group property instead. See also the 1.14 release notes.');
taskDescriptionProperties.isTestCommand.deprecationMessage = nls.localize('JsonSchema.tasks.isTestCommand.deprecated', 'The property isTestCommand is deprecated. Use the group property instead. See also the 1.14 release notes.');
// Process tasks are almost identical schema-wise to shell tasks, but they are required to have a command
processTask.properties.type = {
    type: 'string',
    enum: ['process'],
    default: 'process',
    description: nls.localize('JsonSchema.tasks.type', 'Defines whether the task is run as a process or as a command inside a shell.')
};
processTask.required.push('command');
processTask.required.push('type');
taskDefinitions.push(processTask);
taskDefinitions.push({
    $ref: '#/definitions/taskDescription'
});
const definitionsTaskRunnerConfigurationProperties = definitions.taskRunnerConfiguration.properties;
const tasks = definitionsTaskRunnerConfigurationProperties.tasks;
tasks.items = {
    oneOf: taskDefinitions
};
definitionsTaskRunnerConfigurationProperties.inputs = inputsSchema.definitions.inputs;
definitions.commandConfiguration.properties.isShellCommand = Objects.deepClone(shellCommand);
definitions.commandConfiguration.properties.args = Objects.deepClone(args);
definitions.options.properties.shell = {
    $ref: '#/definitions/shellConfiguration'
};
definitionsTaskRunnerConfigurationProperties.isShellCommand = Objects.deepClone(shellCommand);
definitionsTaskRunnerConfigurationProperties.type = Objects.deepClone(taskType);
definitionsTaskRunnerConfigurationProperties.group = Objects.deepClone(group);
definitionsTaskRunnerConfigurationProperties.presentation = Objects.deepClone(presentation);
definitionsTaskRunnerConfigurationProperties.suppressTaskName.deprecationMessage = nls.localize('JsonSchema.tasks.suppressTaskName.deprecated', 'The property suppressTaskName is deprecated. Inline the command with its arguments into the task instead. See also the 1.14 release notes.');
definitionsTaskRunnerConfigurationProperties.taskSelector.deprecationMessage = nls.localize('JsonSchema.tasks.taskSelector.deprecated', 'The property taskSelector is deprecated. Inline the command with its arguments into the task instead. See also the 1.14 release notes.');
const osSpecificTaskRunnerConfiguration = Objects.deepClone(definitions.taskRunnerConfiguration);
delete osSpecificTaskRunnerConfiguration.properties.tasks;
osSpecificTaskRunnerConfiguration.additionalProperties = false;
definitions.osSpecificTaskRunnerConfiguration = osSpecificTaskRunnerConfiguration;
definitionsTaskRunnerConfigurationProperties.version = Objects.deepClone(version);
const schema = {
    oneOf: [
        {
            'allOf': [
                {
                    type: 'object',
                    required: ['version'],
                    properties: {
                        version: Objects.deepClone(version),
                        windows: {
                            '$ref': '#/definitions/osSpecificTaskRunnerConfiguration',
                            'description': nls.localize('JsonSchema.windows', 'Windows specific command configuration')
                        },
                        osx: {
                            '$ref': '#/definitions/osSpecificTaskRunnerConfiguration',
                            'description': nls.localize('JsonSchema.mac', 'Mac specific command configuration')
                        },
                        linux: {
                            '$ref': '#/definitions/osSpecificTaskRunnerConfiguration',
                            'description': nls.localize('JsonSchema.linux', 'Linux specific command configuration')
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
schema.definitions = definitions;
function deprecatedVariableMessage(schemaMap, property) {
    const mapAtProperty = schemaMap[property].properties;
    if (mapAtProperty) {
        Object.keys(mapAtProperty).forEach(name => {
            deprecatedVariableMessage(mapAtProperty, name);
        });
    }
    else {
        ConfigurationResolverUtils.applyDeprecatedVariableMessage(schemaMap[property]);
    }
}
Object.getOwnPropertyNames(definitions).forEach(key => {
    const newKey = key + '2';
    definitions[newKey] = definitions[key];
    delete definitions[key];
    deprecatedVariableMessage(definitions, newKey);
});
fixReferences(schema);
export function updateProblemMatchers() {
    try {
        const matcherIds = ProblemMatcherRegistry.keys().map(key => '$' + key);
        definitions.problemMatcherType2.oneOf[0].enum = matcherIds;
        definitions.problemMatcherType2.oneOf[2].items.anyOf[0].enum = matcherIds;
    }
    catch (err) {
        console.log('Installing problem matcher ids failed');
    }
}
ProblemMatcherRegistry.onReady().then(() => {
    updateProblemMatchers();
});
export default schema;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvblNjaGVtYV92Mi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi9qc29uU2NoZW1hX3YyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUc5RCxPQUFPLFlBQVksTUFBTSx1QkFBdUIsQ0FBQztBQUVqRCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNyRSxPQUFPLEtBQUssMEJBQTBCLE1BQU0sOEVBQThFLENBQUM7QUFDM0gsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQzdHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVyRSxTQUFTLGFBQWEsQ0FBQyxPQUE0QztJQUNsRSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUM1QixPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ3pCLElBQUksT0FBTyxPQUFPLEtBQUssUUFBUSxJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDckQsYUFBYSxDQUFDLE9BQWtDLENBQUMsQ0FBQztZQUNuRCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO1NBQU0sSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUN4QyxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ3JCLE9BQU8sQ0FBQyxNQUFNLENBQUMsR0FBRyxPQUFPLENBQUMsTUFB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