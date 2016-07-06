/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');

import {buffer} from 'vs/base/node/request';
import {join, dirname} from 'vs/base/common/paths';
import URI from 'vs/base/common/uri';

import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IFileService} from 'vs/platform/files/common/files';

import emmet = require('emmet');

function isURL(path: string): boolean {
	return /^https?:\/\//.test(path);
}

export function getFullPath(parent: string, filename: string): string {
	return join(dirname(parent), filename);
}

export class FileAccessor implements emmet.File {

	messageService: IMessageService;
	fileService: IFileService;

	constructor(messageService: IMessageService, fileService: IFileService) {
		this.messageService = messageService;
		this.fileService = fileService;
	}

	public createPath(parent: string, filename: string, callback: any): void {
		callback(null, getFullPath(parent, filename));
	}

	public locateFile(parent: string, filename: string, callback: any): void {
		if (isURL(filename)) {
			return callback(filename);
		}

		const filepath = getFullPath(parent, filename);
		const fileUri = URI.file(filepath);
		this.fileService.existsFile(fileUri).then(fileExist => {
			if (!fileExist) {
				const message = nls.localize('fileNotExist', "File does not exist: **{0}**", filename);
				this.messageService.show(Severity.Warning, message);
				return;
			}

			callback(filepath);
		});
	}

	public read(path: string, callback: any): void {
		if (isURL(path)) {
			buffer({ url: path }).then(buf => callback(null, buf.toString('binary')), err => {
				const errCode = err.code ? err.code : err;
				const message = nls.localize('requestError', "Request error: **{0}**", errCode);
				this.messageService.show(Severity.Error, message);
			});
		} else {
			const pathUri = URI.file(path);
			this.fileService.resolveContent(pathUri, { encoding: 'binary' }).then(content => {
				callback(null, content.value);
			}, err => {
				this.messageService.show(Severity.Error, err);
			});
		}
	}

	public save(file: string, content: string, callback: any): void {
		const fileUri = URI.file(file);
		this.fileService.updateContent(fileUri, content, { encoding: 'binary' }).then(() => {
			callback(null);
		}, err => {
			this.messageService.show(Severity.Error, err);
		});
	}

	public get listOfMethods() {
		return {
			locateFile: this.locateFile.bind(this),
			createPath: this.createPath.bind(this),
			read: this.read.bind(this),
			save: this.save.bind(this)
		};
	}
}
