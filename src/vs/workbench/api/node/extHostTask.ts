/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as UUID from 'vs/base/common/uuid';
import { asWinJsPromise } from 'vs/base/common/async';

import * as Problems from 'vs/platform/markers/common/problemMatcher';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import * as TaskSystem from 'vs/workbench/parts/tasks/common/tasks';

import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, MainThreadTaskShape, ExtHostTaskShape } from 'vs/workbench/api/node/extHost.protocol';
import { fromDiagnosticSeverity } from 'vs/workbench/api/node/extHostTypeConverters';

import * as types from 'vs/workbench/api/node/extHostTypes';
import * as vscode from 'vscode';

interface StringMap<V> {
	[key: string]: V;
}

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

namespace WathingMatcher {
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
	export function from(values: vscode.ProblemMatcher[]): Problems.ProblemMatcher[] {
		if (values === void 0 || values === null) {
			return undefined;
		}
		let result: Problems.ProblemMatcher[];
		for (let value of values) {
			let converted = fromSingle(value);
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

namespace RevealKind {
	export function from(value: vscode.RevealKind): TaskSystem.ShowOutput {
		if (value === void 0 || value === null) {
			return TaskSystem.ShowOutput.Always;
		}
		switch (value) {
			case types.RevealKind.Silent:
				return TaskSystem.ShowOutput.Silent;
			case types.RevealKind.Never:
				return TaskSystem.ShowOutput.Never;
		}
		return TaskSystem.ShowOutput.Always;
	}
}

namespace TerminalBehaviour {
	export function from(value: vscode.TerminalBehaviour): { showOutput: TaskSystem.ShowOutput, echo: boolean } {
		if (value === void 0 || value === null) {
			return { showOutput: TaskSystem.ShowOutput.Always, echo: false };
		}
		return { showOutput: RevealKind.from(value.reveal), echo: !!value.echo };
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
	export function from(value: { cwd?: string; env?: { [key: string]: string; } }): TaskSystem.CommandOptions {
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
		return result;
	}
}

namespace ShellConfiguration {
	export function from(value: { executable?: string, args?: string[] }): boolean | TaskSystem.ShellConfiguration {
		if (value === void 0 || value === null || typeof value.executable !== 'string') {
			return true;
		}

		let result: TaskSystem.ShellConfiguration = {
			executable: value.executable,
			args: Strings.from(value.args)
		};
		return result;
	}
}

namespace Tasks {

	export function from(tasks: vscode.Task[], uuidMap: UUIDMap): TaskSystem.Task[] {
		if (tasks === void 0 || tasks === null) {
			return [];
		}
		let result: TaskSystem.Task[] = [];
		try {
			uuidMap.start();
			for (let task of tasks) {
				let converted = fromSingle(task, uuidMap);
				if (converted) {
					result.push(converted);
				}
			}
		} finally {
			uuidMap.finish();
		}
		return result;
	}

	function fromSingle(task: vscode.Task, uuidMap: UUIDMap): TaskSystem.Task {
		if (typeof task.name !== 'string' || typeof task.identifier !== 'string') {
			return undefined;
		}
		let command: TaskSystem.CommandConfiguration;
		if (task instanceof types.ProcessTask) {
			command = getProcessCommand(task);
		} else if (task instanceof types.ShellTask) {
			command = getShellCommand(task);
		} else {
			return undefined;
		}
		if (command === void 0) {
			return undefined;
		}
		let behaviour = TerminalBehaviour.from(task.terminal);
		command.echo = behaviour.echo;
		let result: TaskSystem.Task = {
			_id: uuidMap.getUUID(task.identifier),
			name: task.name,
			identifier: task.identifier,
			group: types.TaskGroup.is(task.group) ? task.group : undefined,
			command: command,
			showOutput: behaviour.showOutput,
			isBackground: !!task.isBackground,
			suppressTaskName: true,
			problemMatchers: ProblemMatcher.from(task.problemMatchers)
		};
		return result;
	}

	function getProcessCommand(value: vscode.ProcessTask): TaskSystem.CommandConfiguration {
		if (typeof value.process !== 'string') {
			return undefined;
		}
		let result: TaskSystem.CommandConfiguration = {
			name: value.process,
			args: Strings.from(value.args),
			isShellCommand: false,
			echo: false,
		};
		if (value.options) {
			result.options = CommandOptions.from(value.options);
		}
		return result;
	}

	function getShellCommand(value: vscode.ShellTask): TaskSystem.CommandConfiguration {
		if (typeof value.commandLine !== 'string') {
			return undefined;
		}
		let result: TaskSystem.CommandConfiguration = {
			name: value.commandLine,
			isShellCommand: ShellConfiguration.from(value.options),
			echo: false
		};
		if (value.options) {
			result.options = CommandOptions.from(value.options);
		}
		return result;
	}
}

class UUIDMap {

	private _map: StringMap<string>;
	private _unused: StringMap<boolean>;

	constructor() {
		this._map = Object.create(null);
	}

	public start(): void {
		this._unused = Object.create(null);
		Object.keys(this._map).forEach(key => this._unused[key] = true);
	}

	public getUUID(identifier: string): string {
		delete this._unused[identifier];
		let result = this._map[identifier];
		if (result) {
			return result;
		}
		result = UUID.generateUuid();
		this._map[identifier] = result;
		return result;
	}

	public finish(): void {
		Object.keys(this._unused).forEach(key => delete this._map[key]);
		this._unused = null;
	}
}

interface HandlerData {
	provider: vscode.TaskProvider;
	extension: IExtensionDescription;
}

export class ExtHostTask extends ExtHostTaskShape {

	private _proxy: MainThreadTaskShape;
	private _handleCounter: number;
	private _handlers: Map<number, HandlerData>;
	private _idMaps: Map<string, UUIDMap>;

	constructor(threadService: IThreadService) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadTask);
		this._handleCounter = 0;
		this._handlers = new Map<number, HandlerData>();
		this._idMaps = new Map<string, UUIDMap>();
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
				tasks: Tasks.from(value, this.getUUIDMap(handler.extension.id)),
				extension: handler.extension
			};
		});
	}

	private nextHandle(): number {
		return this._handleCounter++;
	}

	private getUUIDMap(extensionId: string): UUIDMap {
		let result = this._idMaps.get(extensionId);
		if (result) {
			return result;
		}
		result = new UUIDMap();
		this._idMaps.set(extensionId, result);
		return result;
	}
}