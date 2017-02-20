/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import * as Objects from 'vs/base/common/objects';
import * as Paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import Strings = require('vs/base/common/strings');
import Collections = require('vs/base/common/collections');

import { CommandOptions, Source, ErrorData } from 'vs/base/common/processes';
import { LineProcess } from 'vs/base/node/processes';

import { IFileService } from 'vs/platform/files/common/files';

import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';

import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

import * as TaskConfig from '../common/taskConfiguration';

let build: string = 'build';
let test: string = 'test';
let defaultValue: string = 'default';

interface TaskInfo {
	index: number;
	exact: number;
}

interface TaskInfos {
	build: TaskInfo;
	test: TaskInfo;
}

interface TaskDetectorMatcher {
	init();
	match(tasks: string[], line: string);
}

interface DetectorConfig {
	matcher: TaskDetectorMatcher;
	arg: string;
}

class RegexpTaskMatcher implements TaskDetectorMatcher {
	private regexp: RegExp;

	constructor(regExp: RegExp) {
		this.regexp = regExp;
	}

	init() {
	}

	match(tasks: string[], line: string) {
		let matches = this.regexp.exec(line);
		if (matches && matches.length > 0) {
			tasks.push(matches[1]);
		}
	}
}

class GruntTaskMatcher implements TaskDetectorMatcher {
	private tasksStart: boolean;
	private tasksEnd: boolean;
	private descriptionOffset: number;

	init() {
		this.tasksStart = false;
		this.tasksEnd = false;
		this.descriptionOffset = null;
	}

	match(tasks: string[], line: string) {
		// grunt lists tasks as follows (description is wrapped into a new line if too long):
		// ...
		// Available tasks
		//         uglify  Minify files with UglifyJS. *
		//         jshint  Validate files with JSHint. *
		//           test  Alias for "jshint", "qunit" tasks.
		//        default  Alias for "jshint", "qunit", "concat", "uglify" tasks.
		//           long  Alias for "eslint", "qunit", "browserify", "sass",
		//                 "autoprefixer", "uglify", tasks.
		//
		// Tasks run in the order specified
		if (!this.tasksStart && !this.tasksEnd) {
			if (line.indexOf('Available tasks') === 0) {
				this.tasksStart = true;
			}
		}
		else if (this.tasksStart && !this.tasksEnd) {
			if (line.indexOf('Tasks run in the order specified') === 0) {
				this.tasksEnd = true;
			} else {
				if (this.descriptionOffset === null) {
					this.descriptionOffset = line.match(/\S  \S/).index + 1;
				}
				let taskName = line.substr(0, this.descriptionOffset).trim();
				if (taskName.length > 0) {
					tasks.push(taskName);
				}
			}
		}
	}
}

export interface DetectorResult {
	config: TaskConfig.ExternalTaskRunnerConfiguration;
	stdout: string[];
	stderr: string[];
}

export class ProcessRunnerDetector {

	private static Version: string = '0.1.0';

	private static SupportedRunners: Collections.IStringDictionary<boolean> = {
		'gulp': true,
		'jake': true,
		'grunt': true
	};

	private static TaskMatchers: Collections.IStringDictionary<DetectorConfig> = {
		'gulp': { matcher: new RegexpTaskMatcher(/^(.*)$/), arg: '--tasks-simple' },
		'jake': { matcher: new RegexpTaskMatcher(/^jake\s+([^\s]+)\s/), arg: '--tasks' },
		'grunt': { matcher: new GruntTaskMatcher(), arg: '--help' },
	};

	public static supports(runner: string): boolean {
		return ProcessRunnerDetector.SupportedRunners[runner];
	}

	private static detectorConfig(runner: string): DetectorConfig {
		return ProcessRunnerDetector.TaskMatchers[runner];
	}

	private static DefaultProblemMatchers: string[] = ['$lessCompile', '$tsc', '$jshint'];

	private fileService: IFileService;
	private contextService: IWorkspaceContextService;
	private configurationResolverService: IConfigurationResolverService;
	private taskConfiguration: TaskConfig.ExternalTaskRunnerConfiguration;
	private _stderr: string[];
	private _stdout: string[];
	private _cwd: string;

	constructor(fileService: IFileService, contextService: IWorkspaceContextService, configurationResolverService: IConfigurationResolverService, config: TaskConfig.ExternalTaskRunnerConfiguration = null) {
		this.fileService = fileService;
		this.contextService = contextService;
		this.configurationResolverService = configurationResolverService;
		this.taskConfiguration = config;
		this._stderr = [];
		this._stdout = [];
		const workspace = this.contextService.getWorkspace();
		this._cwd = workspace ? Paths.normalize(workspace.resource.fsPath, true) : '';
	}

	public get stderr(): string[] {
		return this._stderr;
	}

	public get stdout(): string[] {
		return this._stdout;
	}

	public detect(list: boolean = false, detectSpecific?: string): TPromise<DetectorResult> {
		if (this.taskConfiguration && this.taskConfiguration.command && ProcessRunnerDetector.supports(this.taskConfiguration.command)) {
			let config = ProcessRunnerDetector.detectorConfig(this.taskConfiguration.command);
			let args = (this.taskConfiguration.args || []).concat(config.arg);
			let options: CommandOptions = this.taskConfiguration.options ? this.resolveCommandOptions(this.taskConfiguration.options) : { cwd: this._cwd };
			let isShellCommand = !!this.taskConfiguration.isShellCommand;
			return this.runDetection(
				new LineProcess(this.taskConfiguration.command, this.configurationResolverService.resolve(args), isShellCommand, options),
				this.taskConfiguration.command, isShellCommand, config.matcher, ProcessRunnerDetector.DefaultProblemMatchers, list);
		} else {
			if (detectSpecific) {
				let detectorPromise: TPromise<DetectorResult>;
				if ('gulp' === detectSpecific) {
					detectorPromise = this.tryDetectGulp(list);
				} else if ('jake' === detectSpecific) {
					detectorPromise = this.tryDetectJake(list);
				} else if ('grunt' === detectSpecific) {
					detectorPromise = this.tryDetectGrunt(list);
				}
				return detectorPromise.then((value) => {
					if (value) {
						return value;
					} else {
						return { config: null, stdout: this.stdout, stderr: this.stderr };
					}
				});
			} else {
				return this.tryDetectGulp(list).then((value) => {
					if (value) {
						return value;
					}
					return this.tryDetectJake(list).then((value) => {
						if (value) {
							return value;
						}
						return this.tryDetectGrunt(list).then((value) => {
							if (value) {
								return value;
							}
							return { config: null, stdout: this.stdout, stderr: this.stderr };
						});
					});
				});
			}
		}
	}

	private resolveCommandOptions(options: CommandOptions): CommandOptions {
		let result = Objects.clone(options);
		if (result.cwd) {
			result.cwd = this.configurationResolverService.resolve(result.cwd);
		}
		if (result.env) {
			result.env = this.configurationResolverService.resolve(result.env);
		}
		return result;
	}

	private tryDetectGulp(list: boolean): TPromise<{ config: TaskConfig.ExternalTaskRunnerConfiguration; stderr: string[]; }> {
		return this.fileService.resolveFile(this.contextService.toResource('gulpfile.js')).then((stat) => {
			let config = ProcessRunnerDetector.detectorConfig('gulp');
			let process = new LineProcess('gulp', [config.arg, '--no-color'], true, { cwd: this._cwd });
			return this.runDetection(process, 'gulp', true, config.matcher, ProcessRunnerDetector.DefaultProblemMatchers, list);
		}, (err: any): TaskConfig.ExternalTaskRunnerConfiguration => {
			return null;
		});
	}

	private tryDetectGrunt(list: boolean): TPromise<{ config: TaskConfig.ExternalTaskRunnerConfiguration; stderr: string[]; }> {
		return this.fileService.resolveFile(this.contextService.toResource('Gruntfile.js')).then((stat) => {
			let config = ProcessRunnerDetector.detectorConfig('grunt');
			let process = new LineProcess('grunt', [config.arg, '--no-color'], true, { cwd: this._cwd });
			return this.runDetection(process, 'grunt', true, config.matcher, ProcessRunnerDetector.DefaultProblemMatchers, list);
		}, (err: any): TaskConfig.ExternalTaskRunnerConfiguration => {
			return null;
		});
	}

	private tryDetectJake(list: boolean): TPromise<{ config: TaskConfig.ExternalTaskRunnerConfiguration; stderr: string[]; }> {
		let run = () => {
			let config = ProcessRunnerDetector.detectorConfig('jake');
			let process = new LineProcess('jake', [config.arg], true, { cwd: this._cwd });
			return this.runDetection(process, 'jake', true, config.matcher, ProcessRunnerDetector.DefaultProblemMatchers, list);
		};
		return this.fileService.resolveFile(this.contextService.toResource('Jakefile')).then((stat) => {
			return run();
		}, (err: any) => {
			return this.fileService.resolveFile(this.contextService.toResource('Jakefile.js')).then((stat) => {
				return run();
			}, (err: any): TaskConfig.ExternalTaskRunnerConfiguration => {
				return null;
			});
		});
	}

	private runDetection(process: LineProcess, command: string, isShellCommand: boolean, matcher: TaskDetectorMatcher, problemMatchers: string[], list: boolean): TPromise<DetectorResult> {
		let tasks: string[] = [];
		matcher.init();
		return process.start().then((success) => {
			if (tasks.length === 0) {
				if (success.cmdCode !== 0) {
					if (command === 'gulp') {
						this._stderr.push(nls.localize('TaskSystemDetector.noGulpTasks', 'Running gulp --tasks-simple didn\'t list any tasks. Did you run npm install?'));
					} else if (command === 'jake') {
						this._stderr.push(nls.localize('TaskSystemDetector.noJakeTasks', 'Running jake --tasks didn\'t list any tasks. Did you run npm install?'));
					}
				}
				return { config: null, stdout: this._stdout, stderr: this._stderr };
			}
			let result: TaskConfig.ExternalTaskRunnerConfiguration = {
				version: ProcessRunnerDetector.Version,
				command: command,
				isShellCommand: isShellCommand
			};
			// Hack. We need to remove this.
			if (command === 'gulp') {
				result.args = ['--no-color'];
			}
			result.tasks = this.createTaskDescriptions(tasks, problemMatchers, list);
			return { config: result, stdout: this._stdout, stderr: this._stderr };
		}, (err: ErrorData) => {
			let error = err.error;
			if ((<any>error).code === 'ENOENT') {
				if (command === 'gulp') {
					this._stderr.push(nls.localize('TaskSystemDetector.noGulpProgram', 'Gulp is not installed on your system. Run npm install -g gulp to install it.'));
				} else if (command === 'jake') {
					this._stderr.push(nls.localize('TaskSystemDetector.noJakeProgram', 'Jake is not installed on your system. Run npm install -g jake to install it.'));
				} else if (command === 'grunt') {
					this._stderr.push(nls.localize('TaskSystemDetector.noGruntProgram', 'Grunt is not installed on your system. Run npm install -g grunt to install it.'));
				}
			} else {
				this._stderr.push(nls.localize('TaskSystemDetector.noProgram', 'Program {0} was not found. Message is {1}', command, error.message));
			}
			return { config: null, stdout: this._stdout, stderr: this._stderr };
		}, (progress) => {
			if (progress.source === Source.stderr) {
				this._stderr.push(progress.line);
				return;
			}
			let line = Strings.removeAnsiEscapeCodes(progress.line);
			let matches = matcher.match(tasks, line);
			if (matches && matches.length > 0) {
				tasks.push(matches[1]);
			}
		});
	}

	private createTaskDescriptions(tasks: string[], problemMatchers: string[], list: boolean): TaskConfig.TaskDescription[] {
		let taskConfigs: TaskConfig.TaskDescription[] = [];
		if (list) {
			tasks.forEach((task) => {
				taskConfigs.push({
					taskName: task,
					identifier: task,
					args: [],
					isWatching: false
				});
			});
		} else {
			let taskInfos: TaskInfos = {
				build: { index: -1, exact: -1 },
				test: { index: -1, exact: -1 }
			};
			tasks.forEach((task, index) => {
				this.testBuild(taskInfos.build, task, index);
				this.testTest(taskInfos.test, task, index);
			});
			if (taskInfos.build.index !== -1) {
				let name = tasks[taskInfos.build.index];
				this._stdout.push(nls.localize('TaskSystemDetector.buildTaskDetected', 'Build task named \'{0}\' detected.', name));
				taskConfigs.push({
					taskName: name,
					identifier: name,
					args: [],
					isBuildCommand: true,
					isWatching: false,
					problemMatcher: problemMatchers
				});
			}
			if (taskInfos.test.index !== -1) {
				let name = tasks[taskInfos.test.index];
				this._stdout.push(nls.localize('TaskSystemDetector.testTaskDetected', 'Test task named \'{0}\' detected.', name));
				taskConfigs.push({
					taskName: name,
					identifier: name,
					args: [],
					isTestCommand: true
				});
			}
		}
		return taskConfigs;
	}

	private testBuild(taskInfo: TaskInfo, taskName: string, index: number): void {
		if (taskName === build) {
			taskInfo.index = index;
			taskInfo.exact = 4;
		} else if ((Strings.startsWith(taskName, build) || Strings.endsWith(taskName, build)) && taskInfo.exact < 4) {
			taskInfo.index = index;
			taskInfo.exact = 3;
		} else if (taskName.indexOf(build) !== -1 && taskInfo.exact < 3) {
			taskInfo.index = index;
			taskInfo.exact = 2;
		} else if (taskName === defaultValue && taskInfo.exact < 2) {
			taskInfo.index = index;
			taskInfo.exact = 1;
		}
	}

	private testTest(taskInfo: TaskInfo, taskName: string, index: number): void {
		if (taskName === test) {
			taskInfo.index = index;
			taskInfo.exact = 3;
		} else if ((Strings.startsWith(taskName, test) || Strings.endsWith(taskName, test)) && taskInfo.exact < 3) {
			taskInfo.index = index;
			taskInfo.exact = 2;
		} else if (taskName.indexOf(test) !== -1 && taskInfo.exact < 2) {
			taskInfo.index = index;
			taskInfo.exact = 1;
		}
	}
}
