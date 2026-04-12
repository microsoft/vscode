/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Schemas } from './problemMatcher.js';
const schema = {
    definitions: {
        showOutputType: {
            type: 'string',
            enum: ['always', 'silent', 'never']
        },
        options: {
            type: 'object',
            description: nls.localize('JsonSchema.options', 'Additional command options'),
            properties: {
                cwd: {
                    type: 'string',
                    description: nls.localize('JsonSchema.options.cwd', 'The current working directory of the executed program or script. If omitted Code\'s current workspace root is used.')
                },
                env: {
                    type: 'object',
                    additionalProperties: {
                        type: 'string'
                    },
                    description: nls.localize('JsonSchema.options.env', 'The environment of the executed program or shell. If omitted the parent process\' environment is used.')
                }
            },
            additionalProperties: {
                type: ['string', 'array', 'object']
            }
        },
        problemMatcherType: {
            oneOf: [
                {
                    type: 'string',
                    errorMessage: nls.localize('JsonSchema.tasks.matcherError', 'Unrecognized problem matcher. Is the extension that contributes this problem matcher installed?')
                },
                Schemas.LegacyProblemMatcher,
                {
                    type: 'array',
                    items: {
                        anyOf: [
                            {
                                type: 'string',
                                errorMessage: nls.localize('JsonSchema.tasks.matcherError', 'Unrecognized problem matcher. Is the extension that contributes this problem matcher installed?')
                            },
                            Schemas.LegacyProblemMatcher
                        ]
                    }
                }
            ]
        },
        shellConfiguration: {
            type: 'object',
            additionalProperties: false,
            description: nls.localize('JsonSchema.shellConfiguration', 'Configures the shell to be used.'),
            properties: {
                executable: {
                    type: 'string',
                    description: nls.localize('JsonSchema.shell.executable', 'The shell to be used.')
                },
                args: {
                    type: 'array',
                    description: nls.localize('JsonSchema.shell.args', 'The shell arguments.'),
                    items: {
                        type: 'string'
                    }
                }
            }
        },
        commandConfiguration: {
            type: 'object',
            additionalProperties: false,
            properties: {
                command: {
                    type: 'string',
                    description: nls.localize('JsonSchema.command', 'The command to be executed. Can be an external program or a shell command.')
                },
                args: {
                    type: 'array',
                    description: nls.localize('JsonSchema.tasks.args', 'Arguments passed to the command when this task is invoked.'),
                    items: {
                        type: 'string'
                    }
                },
                options: {
                    $ref: '#/definitions/options'
                }
            }
        },
        taskDescription: {
            type: 'object',
            required: ['taskName'],
            additionalProperties: false,
            properties: {
                taskName: {
                    type: 'string',
                    description: nls.localize('JsonSchema.tasks.taskName', "The task's name")
                },
                command: {
                    type: 'string',
                    description: nls.localize('JsonSchema.command', 'The command to be executed. Can be an external program or a shell command.')
                },
                args: {
                    type: 'array',
                    description: nls.localize('JsonSchema.tasks.args', 'Arguments passed to the command when this task is invoked.'),
                    items: {
                        type: 'string'
                    }
                },
                options: {
                    $ref: '#/definitions/options'
                },
                windows: {
                    anyOf: [
                        {
                            $ref: '#/definitions/commandConfiguration',
                            description: nls.localize('JsonSchema.tasks.windows', 'Windows specific command configuration'),
                        },
                        {
                            properties: {
                                problemMatcher: {
                                    $ref: '#/definitions/problemMatcherType',
                                    description: nls.localize('JsonSchema.tasks.matchers', 'The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.')
                                }
                            }
                        }
                    ]
                },
                osx: {
                    anyOf: [
                        {
                            $ref: '#/definitions/commandConfiguration',
                            description: nls.localize('JsonSchema.tasks.mac', 'Mac specific command configuration')
                        },
                        {
                            properties: {
                                problemMatcher: {
                                    $ref: '#/definitions/problemMatcherType',
                                    description: nls.localize('JsonSchema.tasks.matchers', 'The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.')
                                }
                            }
                        }
                    ]
                },
                linux: {
                    anyOf: [
                        {
                            $ref: '#/definitions/commandConfiguration',
                            description: nls.localize('JsonSchema.tasks.linux', 'Linux specific command configuration')
                        },
                        {
                            properties: {
                                problemMatcher: {
                                    $ref: '#/definitions/problemMatcherType',
                                    description: nls.localize('JsonSchema.tasks.matchers', 'The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.')
                                }
                            }
                        }
                    ]
                },
                suppressTaskName: {
                    type: 'boolean',
                    description: nls.localize('JsonSchema.tasks.suppressTaskName', 'Controls whether the task name is added as an argument to the command. If omitted the globally defined value is used.'),
                    default: true
                },
                showOutput: {
                    $ref: '#/definitions/showOutputType',
                    description: nls.localize('JsonSchema.tasks.showOutput', 'Controls whether the output of the running task is shown or not. If omitted the globally defined value is used.')
                },
                echoCommand: {
                    type: 'boolean',
                    description: nls.localize('JsonSchema.echoCommand', 'Controls whether the executed command is echoed to the output. Default is false.'),
                    default: true
                },
                isWatching: {
                    type: 'boolean',
                    deprecationMessage: nls.localize('JsonSchema.tasks.watching.deprecation', 'Deprecated. Use isBackground instead.'),
                    description: nls.localize('JsonSchema.tasks.watching', 'Whether the executed task is kept alive and is watching the file system.'),
                    default: true
                },
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
                isBuildCommand: {
                    type: 'boolean',
                    description: nls.localize('JsonSchema.tasks.build', 'Maps this task to Code\'s default build command.'),
                    default: true
                },
                isTestCommand: {
                    type: 'boolean',
                    description: nls.localize('JsonSchema.tasks.test', 'Maps this task to Code\'s default test command.'),
                    default: true
                },
                problemMatcher: {
                    $ref: '#/definitions/problemMatcherType',
                    description: nls.localize('JsonSchema.tasks.matchers', 'The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.')
                }
            }
        },
        taskRunnerConfiguration: {
            type: 'object',
            required: [],
            properties: {
                command: {
                    type: 'string',
                    description: nls.localize('JsonSchema.command', 'The command to be executed. Can be an external program or a shell command.')
                },
                args: {
                    type: 'array',
                    description: nls.localize('JsonSchema.args', 'Additional arguments passed to the command.'),
                    items: {
                        type: 'string'
                    }
                },
                options: {
                    $ref: '#/definitions/options'
                },
                showOutput: {
                    $ref: '#/definitions/showOutputType',
                    description: nls.localize('JsonSchema.showOutput', 'Controls whether the output of the running task is shown or not. If omitted \'always\' is used.')
                },
                isWatching: {
                    type: 'boolean',
                    deprecationMessage: nls.localize('JsonSchema.watching.deprecation', 'Deprecated. Use isBackground instead.'),
                    description: nls.localize('JsonSchema.watching', 'Whether the executed task is kept alive and is watching the file system.'),
                    default: true
                },
                isBackground: {
                    type: 'boolean',
                    description: nls.localize('JsonSchema.background', 'Whether the executed task is kept alive and is running in the background.'),
                    default: true
                },
                promptOnClose: {
                    type: 'boolean',
                    description: nls.localize('JsonSchema.promptOnClose', 'Whether the user is prompted when VS Code closes with a running background task.'),
                    default: false
                },
                echoCommand: {
                    type: 'boolean',
                    description: nls.localize('JsonSchema.echoCommand', 'Controls whether the executed command is echoed to the output. Default is false.'),
                    default: true
                },
                suppressTaskName: {
                    type: 'boolean',
                    description: nls.localize('JsonSchema.suppressTaskName', 'Controls whether the task name is added as an argument to the command. Default is false.'),
                    default: true
                },
                taskSelector: {
                    type: 'string',
                    description: nls.localize('JsonSchema.taskSelector', 'Prefix to indicate that an argument is task.')
                },
                problemMatcher: {
                    $ref: '#/definitions/problemMatcherType',
                    description: nls.localize('JsonSchema.matchers', 'The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.')
                },
                tasks: {
                    type: 'array',
                    description: nls.localize('JsonSchema.tasks', 'The task configurations. Usually these are enrichments of task already defined in the external task runner.'),
                    items: {
                        type: 'object',
                        $ref: '#/definitions/taskDescription'
                    }
                }
            }
        }
    }
};
export default schema;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvblNjaGVtYUNvbW1vbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi9qc29uU2NoZW1hQ29tbW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFHMUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTlDLE1BQU0sTUFBTSxHQUFnQjtJQUMzQixXQUFXLEVBQUU7UUFDWixjQUFjLEVBQUU7WUFDZixJQUFJLEVBQUUsUUFBUTtZQUNkLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDO1NBQ25DO1FBQ0QsT0FBTyxFQUFFO1lBQ1IsSUFBSSxFQUFFLFFBQVE7WUFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSw0QkFBNEIsQ0FBQztZQUM3RSxVQUFVLEVBQUU7Z0JBQ1gsR0FBRyxFQUFFO29CQUNKLElBQUksRUFBRSxRQUFRO29CQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLHFIQUFxSCxDQUFDO2lCQUMxSztnQkFDRCxHQUFHLEVBQUU7b0JBQ0osSUFBSSxFQUFFLFFBQVE7b0JBQ2Qsb0JBQW9CLEVBQUU7d0JBQ3JCLElBQUksRUFBRSxRQUFRO3FCQUNkO29CQUNELFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLHdHQUF3RyxDQUFDO2lCQUM3SjthQUNEO1lBQ0Qsb0JBQW9CLEVBQUU7Z0JBQ3JCLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDO2FBQ25DO1NBQ0Q7UUFDRCxrQkFBa0IsRUFBRTtZQUNuQixLQUFLLEVBQUU7Z0JBQ047b0JBQ0MsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsWUFBWSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsK0JBQStCLEVBQUUsaUdBQWlHLENBQUM7aUJBQzlKO2dCQUNELE9BQU8sQ0FBQyxvQkFBb0I7Z0JBQzVCO29CQUNDLElBQUksRUFBRSxPQUFPO29CQUNiLEtBQUssRUFBRTt3QkFDTixLQUFLLEVBQUU7NEJBQ047Z0NBQ0MsSUFBSSxFQUFFLFFBQVE7Z0NBQ2QsWUFBWSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsK0JBQStCLEVBQUUsaUdBQWlHLENBQUM7NkJBQzlKOzRCQUNELE9BQU8sQ0FBQyxvQkFBb0I7eUJBQzVCO3FCQUNEO2lCQUNEO2FBQ0Q7U0FDRDtRQUNELGtCQUFrQixFQUFFO1lBQ25CLElBQUksRUFBRSxRQUFRO1lBQ2Qsb0JBQW9CLEVBQUUsS0FBSztZQUMzQixXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxrQ0FBa0MsQ0FBQztZQUM5RixVQUFVLEVBQUU7Z0JBQ1gsVUFBVSxFQUFFO29CQUNYLElBQUksRUFBRSxRQUFRO29CQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDZCQUE2QixFQUFFLHVCQUF1QixDQUFDO2lCQUNqRjtnQkFDRCxJQUFJLEVBQUU7b0JBQ0wsSUFBSSxFQUFFLE9BQU87b0JBQ2IsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsc0JBQXNCLENBQUM7b0JBQzFFLEtBQUssRUFBRTt3QkFDTixJQUFJLEVBQUUsUUFBUTtxQkFDZDtpQkFDRDthQUNEO1NBQ0Q7UUFDRCxvQkFBb0IsRUFBRTtZQUNyQixJQUFJLEVBQUUsUUFBUTtZQUNkLG9CQUFvQixFQUFFLEtBQUs7WUFDM0IsVUFBVSxFQUFFO2dCQUNYLE9BQU8sRUFBRTtvQkFDUixJQUFJLEVBQUUsUUFBUTtvQkFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSw0RUFBNEUsQ0FBQztpQkFDN0g7Z0JBQ0QsSUFBSSxFQUFFO29CQUNMLElBQUksRUFBRSxPQUFPO29CQUNiLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDREQUE0RCxDQUFDO29CQUNoSCxLQUFLLEVBQUU7d0JBQ04sSUFBSSxFQUFFLFFBQVE7cUJBQ2Q7aUJBQ0Q7Z0JBQ0QsT0FBTyxFQUFFO29CQUNSLElBQUksRUFBRSx1QkFBdUI7aUJBQzdCO2FBQ0Q7U0FDRDtRQUNELGVBQWUsRUFBRTtZQUNoQixJQUFJLEVBQUUsUUFBUTtZQUNkLFFBQVEsRUFBRSxDQUFDLFVBQVUsQ0FBQztZQUN0QixvQkFBb0IsRUFBRSxLQUFLO1lBQzNCLFVBQVUsRUFBRTtnQkFDWCxRQUFRLEVBQUU7b0JBQ1QsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsaUJBQWlCLENBQUM7aUJBQ3pFO2dCQUNELE9BQU8sRUFBRTtvQkFDUixJQUFJLEVBQUUsUUFBUTtvQkFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSw0RUFBNEUsQ0FBQztpQkFDN0g7Z0JBQ0QsSUFBSSxFQUFFO29CQUNMLElBQUksRUFBRSxPQUFPO29CQUNiLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDREQUE0RCxDQUFDO29CQUNoSCxLQUFLLEVBQUU7d0JBQ04sSUFBSSxFQUFFLFFBQVE7cUJBQ2Q7aUJBQ0Q7Z0JBQ0QsT0FBTyxFQUFFO29CQUNSLElBQUksRUFBRSx1QkFBdUI7aUJBQzdCO2dCQUNELE9BQU8sRUFBRTtvQkFDUixLQUFLLEVBQUU7d0JBQ047NEJBQ0MsSUFBSSxFQUFFLG9DQUFvQzs0QkFDMUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsd0NBQXdDLENBQUM7eUJBQy9GO3dCQUNEOzRCQUNDLFVBQVUsRUFBRTtnQ0FDWCxjQUFjLEVBQUU7b0NBQ2YsSUFBSSxFQUFFLGtDQUFrQztvQ0FDeEMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsb0lBQW9JLENBQUM7aUNBQzVMOzZCQUNEO3lCQUNEO3FCQUNEO2lCQUNEO2dCQUNELEdBQUcsRUFBRTtvQkFDSixLQUFLLEVBQUU7d0JBQ047NEJBQ0MsSUFBSSxFQUFFLG9DQUFvQzs0QkFDMUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUsb0NBQW9DLENBQUM7eUJBQ3ZGO3dCQUNEOzRCQUNDLFVBQVUsRUFBRTtnQ0FDWCxjQUFjLEVBQUU7b0NBQ2YsSUFBSSxFQUFFLGtDQUFrQztvQ0FDeEMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsb0lBQW9JLENBQUM7aUNBQzVMOzZCQUNEO3lCQUNEO3FCQUNEO2lCQUNEO2dCQUNELEtBQUssRUFBRTtvQkFDTixLQUFLLEVBQUU7d0JBQ047NEJBQ0MsSUFBSSxFQUFFLG9DQUFvQzs0QkFDMUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsd0JBQXdCLEVBQUUsc0NBQXNDLENBQUM7eUJBQzNGO3dCQUNEOzRCQUNDLFVBQVUsRUFBRTtnQ0FDWCxjQUFjLEVBQUU7b0NBQ2YsSUFBSSxFQUFFLGtDQUFrQztvQ0FDeEMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsb0lBQW9JLENBQUM7aUNBQzVMOzZCQUNEO3lCQUNEO3FCQUNEO2lCQUNEO2dCQUNELGdCQUFnQixFQUFFO29CQUNqQixJQUFJLEVBQUUsU0FBUztvQkFDZixXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxtQ0FBbUMsRUFBRSx1SEFBdUgsQ0FBQztvQkFDdkwsT0FBTyxFQUFFLElBQUk7aUJBQ2I7Z0JBQ0QsVUFBVSxFQUFFO29CQUNYLElBQUksRUFBRSw4QkFBOEI7b0JBQ3BDLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDZCQUE2QixFQUFFLGlIQUFpSCxDQUFDO2lCQUMzSztnQkFDRCxXQUFXLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFNBQVM7b0JBQ2YsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsd0JBQXdCLEVBQUUsa0ZBQWtGLENBQUM7b0JBQ3ZJLE9BQU8sRUFBRSxJQUFJO2lCQUNiO2dCQUNELFVBQVUsRUFBRTtvQkFDWCxJQUFJLEVBQUUsU0FBUztvQkFDZixrQkFBa0IsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLHVDQUF1QyxDQUFDO29CQUNsSCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSwwRUFBMEUsQ0FBQztvQkFDbEksT0FBTyxFQUFFLElBQUk7aUJBQ2I7Z0JBQ0QsWUFBWSxFQUFFO29CQUNiLElBQUksRUFBRSxTQUFTO29CQUNmLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDZCQUE2QixFQUFFLDJFQUEyRSxDQUFDO29CQUNySSxPQUFPLEVBQUUsSUFBSTtpQkFDYjtnQkFDRCxhQUFhLEVBQUU7b0JBQ2QsSUFBSSxFQUFFLFNBQVM7b0JBQ2YsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsdUVBQXVFLENBQUM7b0JBQ3BJLE9BQU8sRUFBRSxLQUFLO2lCQUNkO2dCQUNELGNBQWMsRUFBRTtvQkFDZixJQUFJLEVBQUUsU0FBUztvQkFDZixXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxrREFBa0QsQ0FBQztvQkFDdkcsT0FBTyxFQUFFLElBQUk7aUJBQ2I7Z0JBQ0QsYUFBYSxFQUFFO29CQUNkLElBQUksRUFBRSxTQUFTO29CQUNmLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLGlEQUFpRCxDQUFDO29CQUNyRyxPQUFPLEVBQUUsSUFBSTtpQkFDYjtnQkFDRCxjQUFjLEVBQUU7b0JBQ2YsSUFBSSxFQUFFLGtDQUFrQztvQkFDeEMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsb0lBQW9JLENBQUM7aUJBQzVMO2FBQ0Q7U0FDRDtRQUNELHVCQUF1QixFQUFFO1lBQ3hCLElBQUksRUFBRSxRQUFRO1lBQ2QsUUFBUSxFQUFFLEVBQUU7WUFDWixVQUFVLEVBQUU7Z0JBQ1gsT0FBTyxFQUFFO29CQUNSLElBQUksRUFBRSxRQUFRO29CQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLDRFQUE0RSxDQUFDO2lCQUM3SDtnQkFDRCxJQUFJLEVBQUU7b0JBQ0wsSUFBSSxFQUFFLE9BQU87b0JBQ2IsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsNkNBQTZDLENBQUM7b0JBQzNGLEtBQUssRUFBRTt3QkFDTixJQUFJLEVBQUUsUUFBUTtxQkFDZDtpQkFDRDtnQkFDRCxPQUFPLEVBQUU7b0JBQ1IsSUFBSSxFQUFFLHVCQUF1QjtpQkFDN0I7Z0JBQ0QsVUFBVSxFQUFFO29CQUNYLElBQUksRUFBRSw4QkFBOEI7b0JBQ3BDLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLGlHQUFpRyxDQUFDO2lCQUNySjtnQkFDRCxVQUFVLEVBQUU7b0JBQ1gsSUFBSSxFQUFFLFNBQVM7b0JBQ2Ysa0JBQWtCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSx1Q0FBdUMsQ0FBQztvQkFDNUcsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsMEVBQTBFLENBQUM7b0JBQzVILE9BQU8sRUFBRSxJQUFJO2lCQUNiO2dCQUNELFlBQVksRUFBRTtvQkFDYixJQUFJLEVBQUUsU0FBUztvQkFDZixXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSwyRUFBMkUsQ0FBQztvQkFDL0gsT0FBTyxFQUFFLElBQUk7aUJBQ2I7Z0JBQ0QsYUFBYSxFQUFFO29CQUNkLElBQUksRUFBRSxTQUFTO29CQUNmLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDBCQUEwQixFQUFFLGtGQUFrRixDQUFDO29CQUN6SSxPQUFPLEVBQUUsS0FBSztpQkFDZDtnQkFDRCxXQUFXLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFNBQVM7b0JBQ2YsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsd0JBQXdCLEVBQUUsa0ZBQWtGLENBQUM7b0JBQ3ZJLE9BQU8sRUFBRSxJQUFJO2lCQUNiO2dCQUNELGdCQUFnQixFQUFFO29CQUNqQixJQUFJLEVBQUUsU0FBUztvQkFDZixXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSwwRkFBMEYsQ0FBQztvQkFDcEosT0FBTyxFQUFFLElBQUk7aUJBQ2I7Z0JBQ0QsWUFBWSxFQUFFO29CQUNiLElBQUksRUFBRSxRQUFRO29CQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHlCQUF5QixFQUFFLDhDQUE4QyxDQUFDO2lCQUNwRztnQkFDRCxjQUFjLEVBQUU7b0JBQ2YsSUFBSSxFQUFFLGtDQUFrQztvQkFDeEMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsb0lBQW9JLENBQUM7aUJBQ3RMO2dCQUNELEtBQUssRUFBRTtvQkFDTixJQUFJLEVBQUUsT0FBTztvQkFDYixXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSw2R0FBNkcsQ0FBQztvQkFDNUosS0FBSyxFQUFFO3dCQUNOLElBQUksRUFBRSxRQUFRO3dCQUNkLElBQUksRUFBRSwrQkFBK0I7cUJBQ3JDO2lCQUNEO2FBQ0Q7U0FDRDtLQUNEO0NBQ0QsQ0FBQztBQUVGLGVBQWUsTUFBTSxDQUFDIn0=