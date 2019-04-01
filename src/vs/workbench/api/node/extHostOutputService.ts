/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadOutputServiceShape, IMainContext, ExtHostOutputServiceShape } from '../common/extHost.protocol';
import * as vscode from 'vscode';
import { URI } from 'vs/base/common/uri';
import { join } from 'vs/base/common/path';
import { OutputAppender } from 'vs/workbench/services/output/node/outputAppender';
import { toLocalISOString } from 'vs/base/common/date';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { dirExists, mkdirp } from 'vs/base/node/pfs';

abstract class AbstractExtHostOutputChannel extends Disposable implements vscode.OutputChannel {

	readonly _id: Promise<string>;
	private readonly _name: string;
	protected readonly _proxy: MainThreadOutputServiceShape;
	private _disposed: boolean;
	private _offset: number;

	protected readonly _onDidAppend: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidAppend: Event<void> = this._onDidAppend.event;

	constructor(name: string, log: boolean, file: URI | undefined, proxy: MainThreadOutputServiceShape) {
		super();

		this._name = name;
		this._proxy = proxy;
		this._id = proxy.$register(this.name, log, file);
		this._offset = 0;
	}

	get name(): string {
		return this._name;
	}

	append(value: string): void {
		this.validate();
		this._offset += value ? Buffer.from(value).byteLength : 0;
	}

	update(): void {
		this._id.then(id => this._proxy.$update(id));
	}

	appendLine(value: string): void {
		this.validate();
		this.append(value + '\n');
	}

	clear(): void {
		this.validate();
		const till = this._offset;
		this._id.then(id => this._proxy.$clear(id, till));
	}

	show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		this.validate();
		this._id.then(id => this._proxy.$reveal(id, !!(typeof columnOrPreserveFocus === 'boolean' ? columnOrPreserveFocus : preserveFocus)));
	}

	hide(): void {
		this.validate();
		this._id.then(id => this._proxy.$close(id));
	}

	protected validate(): void {
		if (this._disposed) {
			throw new Error('Channel has been closed');
		}
	}

	dispose(): void {
		super.dispose();

		if (!this._disposed) {
			this._id
				.then(id => this._proxy.$dispose(id))
				.then(() => this._disposed = true);
		}
	}
}

class ExtHostPushOutputChannel extends AbstractExtHostOutputChannel {

	constructor(name: string, proxy: MainThreadOutputServiceShape) {
		super(name, false, undefined, proxy);
	}

	append(value: string): void {
		super.append(value);
		this._id.then(id => this._proxy.$append(id, value));
		this._onDidAppend.fire();
	}
}

class ExtHostOutputChannelBackedByFile extends AbstractExtHostOutputChannel {

	private _appender: OutputAppender;

	constructor(name: string, appender: OutputAppender, proxy: MainThreadOutputServiceShape) {
		super(name, false, URI.file(appender.file), proxy);
		this._appender = appender;
	}

	append(value: string): void {
		super.append(value);
		this._appender.append(value);
		this._onDidAppend.fire();
	}

	update(): void {
		this._appender.flush();
		super.update();
	}

	show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		this._appender.flush();
		super.show(columnOrPreserveFocus, preserveFocus);
	}

	clear(): void {
		this._appender.flush();
		super.clear();
	}
}

class ExtHostLogFileOutputChannel extends AbstractExtHostOutputChannel {

	constructor(name: string, file: URI, proxy: MainThreadOutputServiceShape) {
		super(name, true, file, proxy);
	}

	append(value: string): void {
		throw new Error('Not supported');
	}
}

let namePool = 1;
async function createExtHostOutputChannel(name: string, outputDirPromise: Promise<string>, proxy: MainThreadOutputServiceShape): Promise<AbstractExtHostOutputChannel> {
	try {
		const outputDir = await outputDirPromise;
		const fileName = `${namePool++}-${name}`;
		const file = URI.file(join(outputDir, `${fileName}.log`));
		const appender = new OutputAppender(fileName, file.fsPath);
		return new ExtHostOutputChannelBackedByFile(name, appender, proxy);
	} catch (error) {
		// Do not crash if logger cannot be created
		console.log(error);
		return new ExtHostPushOutputChannel(name, proxy);
	}
}

export class ExtHostOutputService implements ExtHostOutputServiceShape {

	private readonly _outputDir: Promise<string>;
	private _proxy: MainThreadOutputServiceShape;
	private _channels: Map<string, AbstractExtHostOutputChannel> = new Map<string, AbstractExtHostOutputChannel>();
	private _visibleChannelDisposable: IDisposable;

	constructor(logsLocation: URI, mainContext: IMainContext) {
		const outputDirPath = join(logsLocation.fsPath, `output_logging_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`);
		this._outputDir = dirExists(outputDirPath).then(exists => exists ? exists : mkdirp(outputDirPath).then(() => true)).then(() => outputDirPath);
		this._proxy = mainContext.getProxy(MainContext.MainThreadOutputService);
	}

	$setVisibleChannel(channelId: string): void {
		if (this._visibleChannelDisposable) {
			this._visibleChannelDisposable = dispose(this._visibleChannelDisposable);
		}
		if (channelId) {
			const channel = this._channels.get(channelId);
			if (channel) {
				this._visibleChannelDisposable = channel.onDidAppend(() => channel.update());
			}
		}
	}

	createOutputChannel(name: string): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		} else {
			const extHostOutputChannel = createExtHostOutputChannel(name, this._outputDir, this._proxy);
			extHostOutputChannel.then(channel => channel._id.then(id => this._channels.set(id, channel)));
			return <vscode.OutputChannel>{
				append(value: string): void {
					extHostOutputChannel.then(channel => channel.append(value));
				},
				appendLine(value: string): void {
					extHostOutputChannel.then(channel => channel.appendLine(value));
				},
				clear(): void {
					extHostOutputChannel.then(channel => channel.clear());
				},
				show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
					extHostOutputChannel.then(channel => channel.show(columnOrPreserveFocus, preserveFocus));
				},
				hide(): void {
					extHostOutputChannel.then(channel => channel.hide());
				},
				dispose(): void {
					extHostOutputChannel.then(channel => channel.dispose());
				}
			};
		}
	}

	createOutputChannelFromLogFile(name: string, file: URI): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		}
		if (!file) {
			throw new Error('illegal argument `file`. must not be falsy');
		}
		return new ExtHostLogFileOutputChannel(name, file, this._proxy);
	}
}
