/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as Objects from 'vs/base/common/objects';
import { asWinJsPromise } from 'vs/base/common/async';

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as TaskSystem from 'vs/workbench/parts/tasks/common/tasks';

import { MainContext, MainThreadTaskShape, ExtHostTaskShape, IMainContext } from 'vs/workbench/api/node/extHost.protocol';

import * as types from 'vs/workbench/api/node/extHostTypes';
import * as vscode from 'vscode';

interface StringMap<V> {
	[key: string]: V;
}

/*
namespace ProblemPattern {
	export function from(value: vscode.ProblemPattern | vscode.MultiLineProblemPattern): Problems.ProblemPattern | Problems.MultiLineProblemPattern {
		if (value === void 0 || value === null) {
			return undefined;
		}
		if (Array.isArray(value)) {
			let result: Problems.ProblemPattern[] = [];
			for (let pattern of value) {
				let converted = fromSingle(pattern);
				if (!converted) {
					return undefined;
				}
				result.push(converted);
			}
			return result;
		} else {
			return fromSingle(value);
		}
	}

	function copyProperty(target: Problems.ProblemPattern, source: vscode.ProblemPattern, tk: keyof Problems.ProblemPattern) {
		let sk: keyof vscode.ProblemPattern = tk;
		let value = source[sk];
		if (typeof value === 'number') {
			target[tk] = value;
		}
	}

	function getValue(value: number, defaultValue: number): number {
		if (value !== void 0 && value === null) {
			return value;
		}
		return defaultValue;
	}

	function fromSingle(problemPattern: vscode.ProblemPattern): Problems.ProblemPattern {
		if (problemPattern === void 0 || problemPattern === null || !(problemPattern.regexp instanceof RegExp)) {
			return undefined;
		}
		let result: Problems.ProblemPattern = {
			regexp: problemPattern.regexp
		};
		copyProperty(result, problemPattern, 'file');
		copyProperty(result, problemPattern, 'location');
		copyProperty(result, problemPattern, 'line');
		copyProperty(result, problemPattern, 'character');
		copyProperty(result, problemPattern, 'endLine');
		copyProperty(result, problemPattern, 'endCharacter');
		copyProperty(result, problemPattern, 'severity');
		copyProperty(result, problemPattern, 'code');
		copyProperty(result, problemPattern, 'message');
		if (problemPattern.loop === true || problemPattern.loop === false) {
			result.loop = problemPattern.loop;
		}
		if (result.location) {
			result.file = getValue(result.file, 1);
			result.message = getValue(result.message, 0);
		} else {
			result.file = getValue(result.file, 1);
			result.line = getValue(result.line, 2);
			result.character = getValue(result.character, 3);
			result.message = getValue(result.message, 0);
		}
		return result;
	}
}

namespace ApplyTo {
	export function from(value: vscode.ApplyToKind): Problems.ApplyToKind {
		if (value === void 0 || value === null) {
			return Problems.ApplyToKind.allDocuments;
		}
		switch (value) {
			case types.ApplyToKind.OpenDocuments:
				return Problems.ApplyToKind.openDocuments;
			case types.ApplyToKind.ClosedDocuments:
				return Problems.ApplyToKind.closedDocuments;
		}
		return Problems.ApplyToKind.allDocuments;
	}
}

namespace FileLocation {
	export function from(value: vscode.FileLocationKind | string): { kind: Problems.FileLocationKind; prefix?: string } {
		if (value === void 0 || value === null) {
			return { kind: Problems.FileLocationKind.Auto };
		}
		if (typeof value === 'string') {
			return { kind: Problems.FileLocationKind.Relative, prefix: value };
		}
		switch (value) {
			case types.FileLocationKind.Absolute:
				return { kind: Problems.FileLocationKind.Absolute };
			case types.FileLocationKind.Relative:
				return { kind: Problems.FileLocationKind.Relative, prefix: '${workspaceRoot}' };
		}
		return { kind: Problems.FileLocationKind.Auto };
	}
}

namespace WatchingPattern {
	export function from(value: RegExp | vscode.BackgroundPattern): Problems.WatchingPattern {
		if (value === void 0 || value === null) {
			return undefined;
		}
		if (value instanceof RegExp) {
			return { regexp: value };
		}
		if (!(value.regexp instanceof RegExp)) {
			return undefined;
		}
		let result: Problems.WatchingPattern = {
			regexp: value.regexp
		};
		if (typeof value.file === 'number') {
			result.file = value.file;
		}
		return result;
	}
}

namespace BackgroundMonitor {
	export function from(value: vscode.BackgroundMonitor): Problems.WatchingMatcher {
		if (value === void 0 || value === null) {
			return undefined;
		}
		let result: Problems.WatchingMatcher = {
			activeOnStart: !!value.activeOnStart,
			beginsPattern: WatchingPattern.from(value.beginsPattern),
			endsPattern: WatchingPattern.from(value.endsPattern)
		};
		return result;
	}
}

namespace ProblemMatcher {
	export function from(values: (string | vscode.ProblemMatcher)[]): (string | Problems.ProblemMatcher)[] {
		if (values === void 0 || values === null) {
			return undefined;
		}
		let result: (string | Problems.ProblemMatcher)[] = [];
		for (let value of values) {
			let converted = typeof value === 'string' ? value : fromSingle(value);
			if (converted) {
				result.push(converted);
			}
		}
		return result;
	}

	function fromSingle(problemMatcher: vscode.ProblemMatcher): Problems.ProblemMatcher {
		if (problemMatcher === void 0 || problemMatcher === null) {
			return undefined;
		}

		let location = FileLocation.from(problemMatcher.fileLocation);
		let result: Problems.ProblemMatcher = {
			owner: typeof problemMatcher.owner === 'string' ? problemMatcher.owner : UUID.generateUuid(),
			applyTo: ApplyTo.from(problemMatcher.applyTo),
			fileLocation: location.kind,
			filePrefix: location.prefix,
			pattern: ProblemPattern.from(problemMatcher.pattern),
			severity: fromDiagnosticSeverity(problemMatcher.severity),
		};
		return result;
	}
}
*/

namespace TaskRevealKind {
	export function from(value: vscode.TaskRevealKind): TaskSystem.RevealKind {
		if (value === void 0 || value === null) {
			return TaskSystem.RevealKind.Always;
		}
		switch (value) {
			case types.TaskRevealKind.Silent:
				return TaskSystem.RevealKind.Silent;
			case types.TaskRevealKind.Never:
				return TaskSystem.RevealKind.Never;
		}
		return TaskSystem.RevealKind.Always;
	}
}

namespace TaskPanelKind {
	export function from(value: vscode.TaskPanelKind): TaskSystem.PanelKind {
		if (value === void 0 || value === null) {
			return TaskSystem.PanelKind.Shared;
		}
		switch (value) {
			case types.TaskPanelKind.Dedicated:
				return TaskSystem.PanelKind.Dedicated;
			case types.TaskPanelKind.New:
				return TaskSystem.PanelKind.New;
			default:
				return TaskSystem.PanelKind.Shared;
		}
	}
}

namespace PresentationOptions {
	export function from(value: vscode.TaskPresentationOptions): TaskSystem.PresentationOptions {
		if (value === void 0 || value === null) {
			return { reveal: TaskSystem.RevealKind.Always, echo: true, focus: false, panel: TaskSystem.PanelKind.Shared };
		}
		return {
			reveal: TaskRevealKind.from(value.reveal),
			echo: value.echo === void 0 ? true : !!value.echo,
			focus: !!value.focus,
			panel: TaskPanelKind.from(value.panel)
		};
	}
}

namespace Strings {
	export function from(value: string[]): string[] {
		if (value === void 0 || value === null) {
			return undefined;
		}
		for (let element of value) {
			if (typeof element !== 'string') {
				return [];
			}
		}
		return value;
	}
}

namespace CommandOptions {
	function isShellConfiguration(value: any): value is { executable: string; shellArgs?: string[] } {
		return value && typeof value.executable === 'string';
	}
	export function from(value: vscode.ShellExecutionOptions | vscode.ProcessExecutionOptions): TaskSystem.CommandOptions {
		if (value === void 0 || value === null) {
			return undefined;
		}
		let result: TaskSystem.CommandOptions = {
		};
		if (typeof value.cwd === 'string') {
			result.cwd = value.cwd;
		}
		if (value.env) {
			result.env = Object.create(null);
			Object.keys(value.env).forEach(key => {
				let envValue = value.env[key];
				if (typeof envValue === 'string') {
					result.env[key] = envValue;
				}
			});
		}
		if (isShellConfiguration(value)) {
			result.shell = ShellConfiguration.from(value);
		}
		return result;
	}
}

namespace ShellConfiguration {
	export function from(value: { executable?: string, shellArgs?: string[] }): TaskSystem.ShellConfiguration {
		if (value === void 0 || value === null || !value.executable) {
			return undefined;
		}

		let result: TaskSystem.ShellConfiguration = {
			executable: value.executable,
			args: Strings.from(value.shellArgs)
		};
		return result;
	}
}

namespace Tasks {

	export function from(tasks: vscode.Task[], extension: IExtensionDescription): TaskSystem.Task[] {
		if (tasks === void 0 || tasks === null) {
			return [];
		}
		let result: TaskSystem.Task[] = [];
		for (let task of tasks) {
			let converted = fromSingle(task, extension);
			if (converted) {
				result.push(converted);
			}
		}
		return result;
	}

	function fromSingle(task: vscode.Task, extension: IExtensionDescription): TaskSystem.ContributedTask {
		if (typeof task.name !== 'string') {
			return undefined;
		}
		let command: TaskSystem.CommandConfiguration;
		let execution = task.execution;
		if (execution instanceof types.ProcessExecution) {
			command = getProcessCommand(execution);
		} else if (execution instanceof types.ShellExecution) {
			command = getShellCommand(execution);
		} else {
			return undefined;
		}
		if (command === void 0) {
			return undefined;
		}
		command.presentation = PresentationOptions.from(task.presentationOptions);
		let source = {
			kind: TaskSystem.TaskSourceKind.Extension,
			label: typeof task.source === 'string' ? task.source : extension.name,
			extension: extension.id
		};
		let label = nls.localize('task.label', '{0}: {1}', source.label, task.name);
		let key = (task as types.Task).definitionKey;
		let kind = (task as types.Task).definition;
		let id = `${extension.id}.${key}`;
		let taskKind: TaskSystem.TaskIdentifier = {
			_key: key,
			type: kind.type
		};
		Objects.assign(taskKind, kind);
		let result: TaskSystem.ContributedTask = {
			_id: id, // uuidMap.getUUID(identifier),
			_source: source,
			_label: label,
			type: kind.type,
			defines: taskKind,
			name: task.name,
			identifier: label,
			group: task.group ? (task.group as types.TaskGroup).id : undefined,
			command: command,
			isBackground: !!task.isBackground,
			problemMatchers: task.problemMatchers.slice(),
			hasDefinedMatchers: (task as types.Task).hasDefinedMatchers
		};
		return result;
	}

	function getProcessCommand(value: vscode.ProcessExecution): TaskSystem.CommandConfiguration {
		if (typeof value.process !== 'string') {
			return undefined;
		}
		let result: TaskSystem.CommandConfiguration = {
			name: value.process,
			args: Strings.from(value.args),
			runtime: TaskSystem.RuntimeType.Process,
			suppressTaskName: true,
			presentation: undefined
		};
		if (value.options) {
			result.options = CommandOptions.from(value.options);
		}
		return result;
	}

	function getShellCommand(value: vscode.ShellExecution): TaskSystem.CommandConfiguration {
		if (typeof value.commandLine !== 'string') {
			return undefined;
		}
		let result: TaskSystem.CommandConfiguration = {
			name: value.commandLine,
			runtime: TaskSystem.RuntimeType.Shell,
			presentation: undefined
		};
		if (value.options) {
			result.options = CommandOptions.from(value.options);
		}
		return result;
	}
}

interface HandlerData {
	provider: vscode.TaskProvider;
	extension: IExtensionDescription;
}

export class ExtHostTask implements ExtHostTaskShape {

	private _proxy: MainThreadTaskShape;
	private _handleCounter: number;
	private _handlers: Map<number, HandlerData>;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.get(MainContext.MainThreadTask);
		this._handleCounter = 0;
		this._handlers = new Map<number, HandlerData>();
	};

	public registerTaskProvider(extension: IExtensionDescription, provider: vscode.TaskProvider): vscode.Disposable {
		if (!provider) {
			return new types.Disposable(() => { });
		}
		let handle = this.nextHandle();
		this._handlers.set(handle, { provider, extension });
		this._proxy.$registerTaskProvider(handle);
		return new types.Disposable(() => {
			this._handlers.delete(handle);
			this._proxy.$unregisterTaskProvider(handle);
		});
	}

	public $provideTasks(handle: number): TPromise<TaskSystem.TaskSet> {
		let handler = this._handlers.get(handle);
		if (!handler) {
			return TPromise.wrapError<TaskSystem.TaskSet>(new Error('no handler found'));
		}
		return asWinJsPromise(token => handler.provider.provideTasks(token)).then(value => {
			return {
				tasks: Tasks.from(value, handler.extension),
				extension: handler.extension
			};
		});
	}

	private nextHandle(): number {
		return this._handleCounter++;
	}
}