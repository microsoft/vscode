/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadOutputServiceShape, IMainContext, ExtHostOutputServiceShape } from './extHost.protocol';
import * as vscode from 'vscode';
import { URI } from 'vs/base/common/uri';
import { posix } from 'path';
import { OutputAppender } from 'vs/platform/output/node/outputAppender';
import { toLocalISOString } from 'vs/base/common/date';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';

export abstract class AbstractExtHostOutputChannel extends Disposable implements vscode.OutputChannel {

	readonly _id: Promise<string>;
	private readonly _name: string;
	protected readonly _proxy: MainThreadOutputServiceShape;
	private _disposed: boolean;
	private _offset: number;

	protected readonly _onDidAppend: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidAppend: Event<void> = this._onDidAppend.event;

	constructor(name: string, log: boolean, file: URI, proxy: MainThreadOutputServiceShape) {
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
		this._id.then(id => this._proxy.$reveal(id, typeof columnOrPreserveFocus === 'boolean' ? columnOrPreserveFocus : preserveFocus));
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

export class ExtHostPushOutputChannel extends AbstractExtHostOutputChannel {

	constructor(name: string, proxy: MainThreadOutputServiceShape) {
		super(name, false, null, proxy);
	}

	append(value: string): void {
		super.append(value);
		this._id.then(id => this._proxy.$append(id, value));
		this._onDidAppend.fire();
	}
}

export class ExtHostOutputChannelBackedByFile extends AbstractExtHostOutputChannel {

	private static _namePool = 1;
	private _appender: OutputAppender;

	constructor(name: string, outputDir: string, proxy: MainThreadOutputServiceShape) {
		const fileName = `${ExtHostOutputChannelBackedByFile._namePool++}-${name}`;
		const file = URI.file(posix.join(outputDir, `${fileName}.log`));

		super(name, false, file, proxy);
		this._appender = new OutputAppender(fileName, file.fsPath);
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

export class ExtHostLogFileOutputChannel extends AbstractExtHostOutputChannel {

	constructor(name: string, file: URI, proxy: MainThreadOutputServiceShape) {
		super(name, true, file, proxy);
	}

	append(value: string): void {
		throw new Error('Not supported');
	}
}

export class ExtHostOutputService implements ExtHostOutputServiceShape {

	private _proxy: MainThreadOutputServiceShape;
	private _outputDir: string;
	private _channels: Map<string, AbstractExtHostOutputChannel> = new Map<string, AbstractExtHostOutputChannel>();
	private _visibleChannelDisposable: IDisposable;

	constructor(logsLocation: URI, mainContext: IMainContext) {
		this._outputDir = posix.join(logsLocation.fsPath, `output_logging_${toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')}`);
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
		const channel = this._createOutputChannel(name);
		channel._id.then(id => this._channels.set(id, channel));
		return channel;
	}

	private _createOutputChannel(name: string): AbstractExtHostOutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		} else {
			// Do not crash if logger cannot be created
			try {
				return new ExtHostOutputChannelBackedByFile(name, this._outputDir, this._proxy);
			} catch (error) {
				console.log(error);
				return new ExtHostPushOutputChannel(name, this._proxy);
			}
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
