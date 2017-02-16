/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';

const schema: IJSONSchema = {
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
		patternType: {
			anyOf: [
				{
					type: 'string',
					enum: ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$cpp', '$csc', '$vb', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish', '$go']
				},
				{
					$ref: '#/definitions/pattern'
				},
				{
					type: 'array',
					items: {
						$ref: '#/definitions/pattern'
					}
				}
			]
		},
		pattern: {
			default: {
				regexp: '^([^\\\\s].*)\\\\((\\\\d+,\\\\d+)\\\\):\\\\s*(.*)$',
				file: 1,
				location: 2,
				message: 3
			},
			additionalProperties: false,
			properties: {
				regexp: {
					type: 'string',
					description: nls.localize('JsonSchema.pattern.regexp', 'The regular expression to find an error, warning or info in the output.')
				},
				file: {
					type: 'integer',
					description: nls.localize('JsonSchema.pattern.file', 'The match group index of the filename. If omitted 1 is used.')
				},
				location: {
					type: 'integer',
					description: nls.localize('JsonSchema.pattern.location', 'The match group index of the problem\'s location. Valid location patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn). If omitted (line,column) is assumed.')
				},
				line: {
					type: 'integer',
					description: nls.localize('JsonSchema.pattern.line', 'The match group index of the problem\'s line. Defaults to 2')
				},
				column: {
					type: 'integer',
					description: nls.localize('JsonSchema.pattern.column', 'The match group index of the problem\'s line character. Defaults to 3')
				},
				endLine: {
					type: 'integer',
					description: nls.localize('JsonSchema.pattern.endLine', 'The match group index of the problem\'s end line. Defaults to undefined')
				},
				endColumn: {
					type: 'integer',
					description: nls.localize('JsonSchema.pattern.endColumn', 'The match group index of the problem\'s end line character. Defaults to undefined')
				},
				severity: {
					type: 'integer',
					description: nls.localize('JsonSchema.pattern.severity', 'The match group index of the problem\'s severity. Defaults to undefined')
				},
				code: {
					type: 'integer',
					description: nls.localize('JsonSchema.pattern.code', 'The match group index of the problem\'s code. Defaults to undefined')
				},
				message: {
					type: 'integer',
					description: nls.localize('JsonSchema.pattern.message', 'The match group index of the message. If omitted it defaults to 4 if location is specified. Otherwise it defaults to 5.')
				},
				loop: {
					type: 'boolean',
					description: nls.localize('JsonSchema.pattern.loop', 'In a multi line matcher loop indicated whether this pattern is executed in a loop as long as it matches. Can only specified on a last pattern in a multi line pattern.')
				}
			}
		},
		problemMatcherType: {
			oneOf: [
				{
					type: 'string',
					enum: ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish', '$go']
				},
				{
					$ref: '#/definitions/problemMatcher'
				},
				{
					type: 'array',
					items: {
						anyOf: [
							{
								$ref: '#/definitions/problemMatcher'
							},
							{
								type: 'string',
								enum: ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish', '$go']
							}
						]
					}
				}
			]
		},
		watchingPattern: {
			type: 'object',
			additionalProperties: false,
			properties: {
				regexp: {
					type: 'string',
					description: nls.localize('JsonSchema.watchingPattern.regexp', 'The regular expression to detect the begin or end of a watching task.')
				},
				file: {
					type: 'integer',
					description: nls.localize('JsonSchema.watchingPattern.file', 'The match group index of the filename. Can be omitted.')
				},
			}
		},
		problemMatcher: {
			type: 'object',
			additionalProperties: false,
			properties: {
				base: {
					type: 'string',
					enum: ['$tsc', '$tsc-watch', '$msCompile', '$lessCompile', '$gulp-tsc', '$jshint', '$jshint-stylish', '$eslint-compact', '$eslint-stylish', '$go'],
					description: nls.localize('JsonSchema.problemMatcher.base', 'The name of a base problem matcher to use.')
				},
				owner: {
					type: 'string',
					description: nls.localize('JsonSchema.problemMatcher.owner', 'The owner of the problem inside Code. Can be omitted if base is specified. Defaults to \'external\' if omitted and base is not specified.')
				},
				severity: {
					type: 'string',
					enum: ['error', 'warning', 'info'],
					description: nls.localize('JsonSchema.problemMatcher.severity', 'The default severity for captures problems. Is used if the pattern doesn\'t define a match group for severity.')
				},
				applyTo: {
					type: 'string',
					enum: ['allDocuments', 'openDocuments', 'closedDocuments'],
					description: nls.localize('JsonSchema.problemMatcher.applyTo', 'Controls if a problem reported on a text document is applied only to open, closed or all documents.')
				},
				pattern: {
					$ref: '#/definitions/patternType',
					description: nls.localize('JsonSchema.problemMatcher.pattern', 'A problem pattern or the name of a predefined problem pattern. Can be omitted if base is specified.')
				},
				fileLocation: {
					oneOf: [
						{
							type: 'string',
							enum: ['absolute', 'relative']
						},
						{
							type: 'array',
							items: {
								type: 'string'
							}
						}
					],
					description: nls.localize('JsonSchema.problemMatcher.fileLocation', 'Defines how file names reported in a problem pattern should be interpreted.')
				},
				watching: {
					type: 'object',
					additionalProperties: false,
					properties: {
						activeOnStart: {
							type: 'boolean',
							description: nls.localize('JsonSchema.problemMatcher.watching.activeOnStart', 'If set to true the watcher is in active mode when the task starts. This is equals of issuing a line that matches the beginPattern')
						},
						beginsPattern: {
							oneOf: [
								{
									type: 'string'
								},
								{
									type: '#/definitions/watchingPattern'
								}
							],
							description: nls.localize('JsonSchema.problemMatcher.watching.beginsPattern', 'If matched in the output the start of a watching task is signaled.')
						},
						endsPattern: {
							oneOf: [
								{
									type: 'string'
								},
								{
									type: '#/definitions/watchingPattern'
								}
							],
							description: nls.localize('JsonSchema.problemMatcher.watching.endsPattern', 'If matched in the output the end of a watching task is signaled.')
						}
					}
				},
				watchedTaskBeginsRegExp: {
					type: 'string',
					description: nls.localize('JsonSchema.problemMatcher.watchedBegin', 'A regular expression signaling that a watched tasks begins executing triggered through file watching.')
				},
				watchedTaskEndsRegExp: {
					type: 'string',
					description: nls.localize('JsonSchema.problemMatcher.watchedEnd', 'A regular expression signaling that a watched tasks ends executing.')
				}
			}
		},
		shellConfiguration: {
			type: 'object',
			additionalProperties: false,
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
					$ref: '#/definitions/commandConfiguration',
					description: nls.localize('JsonSchema.tasks.windows', 'Windows specific command configuration')
				},
				osx: {
					$ref: '#/definitions/commandConfiguration',
					description: nls.localize('JsonSchema.tasks.mac', 'Mac specific command configuration')
				},
				linux: {
					$ref: '#/definitions/commandConfiguration',
					description: nls.localize('JsonSchema.tasks.linux', 'Linux specific command configuration')
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