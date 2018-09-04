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
import { TPromise } from 'vs/base/common/winjs.base';

export abstract class AbstractExtHostOutputChannel implements vscode.OutputChannel {

	private static _idPool = 1;

	protected readonly _id: string;
	private readonly _name: string;
	protected readonly _proxy: MainThreadOutputServiceShape;
	protected _registerationPromise: TPromise<void> = TPromise.as(null);
	private _disposed: boolean;

	constructor(name: string, proxy: MainThreadOutputServiceShape) {
		this._id = 'extension-output-#' + (AbstractExtHostOutputChannel._idPool++);
		this._name = name;
		this._proxy = proxy;
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
		this._registerationPromise.then(() => this._proxy.$clear(this._id));
	}

	show(columnOrPreserveFocus?: vscode.ViewColumn | boolean, preserveFocus?: boolean): void {
		this.validate();
		this._registerationPromise.then(() => this._proxy.$reveal(this._id, typeof columnOrPreserveFocus === 'boolean' ? columnOrPreserveFocus : preserveFocus));
	}

	hide(): void {
		this.validate();
		this._registerationPromise.then(() => this._proxy.$close(this._id));
	}

	protected validate(): void {
		if (this._disposed) {
			throw new Error('Channel has been closed');
		}
	}

	dispose(): void {
		if (!this._disposed) {
			this._registerationPromise
				.then(() => this._proxy.$dispose(this._id))
				.then(() => this._disposed = true);
		}
	}
}

export class ExtHostOutputChannel extends AbstractExtHostOutputChannel {

	constructor(name: string, proxy: MainThreadOutputServiceShape) {
		super(name, proxy);
		this._registerationPromise = proxy.$register(this._id, name);
	}

	append(value: string): void {
		this.validate();
		this._registerationPromise.then(() => this._proxy.$append(this._id, value));
	}
}

export class ExtHostLoggingOutputChannel extends AbstractExtHostOutputChannel {

	private _appender: OutputAppender;

	constructor(name: string, outputDir: string, proxy: MainThreadOutputServiceShape) {
		super(name, proxy);
		const file = URI.file(posix.join(outputDir, `${this._id}.log`));
		this._appender = new OutputAppender(this._id, file.fsPath);
		this._registerationPromise = proxy.$register(this._id, this.name, file);

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
