/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import URI from 'vs/base/common/uri';
import ts = require('vs/languages/typescript/common/lib/typescriptServices');

export enum ChangeKind {
	Changed,
	Added,
	Removed
}

export interface IProjectChange {
	kind: ChangeKind;
	resource: URI;
	files: URI[];
	options: ts.CompilerOptions;
}

export interface IFileChange {
	kind: ChangeKind;
	resource: URI;
	content: string;
}

export interface IProjectConsumer {
	acceptProjectChanges(changes: IProjectChange[]): winjs.TPromise<{[dirname:string]:URI}>;
	acceptFileChanges(changes: IFileChange[]): winjs.TPromise<boolean>;
}

export interface IProjectResolver2 {
	setConsumer(consumer: IProjectConsumer): void;
	resolveProjects(): winjs.TPromise<any>;
	resolveFiles(resources: URI[]): winjs.TPromise<any>;
}

export var defaultLib = URI.create('ts', 'defaultlib', '/vs/text!vs/languages/typescript/common/lib/lib.d.ts');
export var defaultLibES6 = URI.create('ts', 'defaultlib', '/vs/text!vs/languages/typescript/common/lib/lib.es6.d.ts');

export function isDefaultLib(uri: URI|string): boolean {
	if (typeof uri === 'string') {
		return uri.indexOf('ts://defaultlib') === 0;
	} else {
		return uri.scheme === 'ts' && uri.authority === 'defaultlib';
	}
}

export var virtualProjectResource = URI.create('ts', 'projects', '/virtual/1');

export class DefaultProjectResolver implements IProjectResolver2 {

	private _consumer: IProjectConsumer;
	private _needsProjectUpdate = false;
	private _fileChanges:IFileChange[] = [];
	private _projectChange:IProjectChange = {
		kind: ChangeKind.Changed,
		resource: virtualProjectResource,
		files: [],
		options: undefined
	};

	setConsumer(consumer: IProjectConsumer) {
		this._consumer = consumer;
	}

	resolveProjects(): winjs.TPromise<any> {
		let promises:winjs.Promise[] = [];
		if(this._fileChanges.length) {
			promises.push(this._consumer.acceptFileChanges(this._fileChanges.slice(0)));
			this._fileChanges.length = 0;
		}
		if(this._needsProjectUpdate) {
			promises.push(this._consumer.acceptProjectChanges([this._projectChange]));
			this._needsProjectUpdate = false;
		}
		return winjs.Promise.join(promises);
	}

	resolveFiles(): winjs.TPromise<any> {
		return undefined;
	}

	addExtraLib(content: string, filePath?: string): void {

		let resource = filePath
			? URI.file(filePath)
			: URI.create('extralib', undefined, Date.now().toString());

		this._needsProjectUpdate = true;
		this._projectChange.files.push(resource);
		this._fileChanges.push({ kind: ChangeKind.Added, resource, content });
	}

	setCompilerOptions(options: ts.CompilerOptions): void {
		this._needsProjectUpdate = true;
		this._projectChange.options = options;
	}
}

export namespace Defaults {

	export const ProjectResolver = new DefaultProjectResolver();

	export function addExtraLib(content: string, filePath?:string): void {
		ProjectResolver.addExtraLib(content, filePath);
	}

	export function setCompilerOptions(options: ts.CompilerOptions): void {
		ProjectResolver.setCompilerOptions(options);
	}
}
