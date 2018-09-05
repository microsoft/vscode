/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { MainContext, MainThreadOutputServiceShape, IMainContext } from './extHost.protocol';
import * as vscode from 'vscode';
import { URI } from 'vs/base/common/uri';
import { posix } from 'path';
import { OutputAppender } from 'vs/platform/output/node/outputAppender';

export abstract class AbstractExtHostOutputChannel implements vscode.OutputChannel {

	protected readonly _id: Thenable<string>;
	private readonly _name: string;
	protected readonly _proxy: MainThreadOutputServiceShape;
	private _disposed: boolean;

	constructor(name: string, file: URI, proxy: MainThreadOutputServiceShape) {
		this._name = name;
		this._proxy = proxy;
		this._id = proxy.$register(this.name, file);
	}

	get name(): string {
		return this._name;
	}

	abstract append(value: string): void;

	appendLine(value: string): void {
		this.validate();
		this.append(value + '\n');
	}

	clear(): void {
		this.validate();
		this._id.then(id => this._proxy.$clear(id));
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
		if (!this._disposed) {
			this._id
				.then(id => this._proxy.$dispose(id))
				.then(() => this._disposed = true);
		}
	}
}

export class ExtHostOutputChannel extends AbstractExtHostOutputChannel {

	constructor(name: string, proxy: MainThreadOutputServiceShape) {
		super(name, null, proxy);
	}

	append(value: string): void {
		this.validate();
		this._id.then(id => this._proxy.$append(id, value));
	}
}

export class ExtHostLoggingOutputChannel extends AbstractExtHostOutputChannel {

	private static _namePool = 1;
	private _appender: OutputAppender;

	constructor(name: string, outputDir: string, proxy: MainThreadOutputServiceShape) {
		const fileName = `${ExtHostLoggingOutputChannel._namePool++}-${name}`;
		const file = URI.file(posix.join(outputDir, `${fileName}.log`));

		super(name, file, proxy);
		this._appender = new OutputAppender(fileName, file.fsPath);
	}

	append(value: string): void {
		this.validate();
		this._appender.append(value);
	}
}

export class ExtHostOutputService {

	private _proxy: MainThreadOutputServiceShape;
	private _outputDir: string;

	constructor(outputDir: string, mainContext: IMainContext) {
		this._outputDir = outputDir;
		this._proxy = mainContext.getProxy(MainContext.MainThreadOutputService);
	}

	createOutputChannel(name: string, logging?: boolean): vscode.OutputChannel {
		name = name.trim();
		if (!name) {
			throw new Error('illegal argument `name`. must not be falsy');
		} else {
			// return logging ? new ExtHostLoggingOutputChannel(name, this._outputDir, this._proxy) : new ExtHostOutputChannel(name, this._proxy);
			return new ExtHostLoggingOutputChannel(name, this._outputDir, this._proxy);
		}
	}
}
