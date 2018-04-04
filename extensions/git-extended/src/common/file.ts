/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { GitProcess } from 'dugite';
import { Repository } from './models/repository';
import { SlimFileChange, GitChangeType, fromStatus } from './models/file';


export async function writeTmpFile(content: string, ext: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		tmp.file({ postfix: ext }, async (err: any, tmpFilePath: string) => {
			if (err) {
				reject(err);
				return;
			}

			try {
				fs.appendFileSync(tmpFilePath, content);
				resolve(tmpFilePath);
			} catch (ex) {
				reject(ex);
			}
		});
	});
}

export async function getFile(commitSha1: string, localFilePath: string): Promise<string> {
	const rootDir = vscode.workspace.rootPath;
	return new Promise<string>((resolve, reject) => {
		if (commitSha1 === undefined) {
			resolve('fileUnavailable');
			return;
		}
		let ext = path.extname(localFilePath);
		tmp.file({ postfix: ext }, async (err: any, tmpFilePath: string) => {
			if (err) {
				reject(err);
				return;
			}
			try {
				let data = await getFileContent(rootDir, commitSha1, localFilePath);
				fs.appendFileSync(tmpFilePath, data);
				resolve(tmpFilePath);
			}
			catch (ex) {
				console.log(ex);
				reject(ex);
			}
		});
	});
}

export async function getFileContent(rootDir: string, commitSha: string, sourceFilePath: string): Promise<string> {
	const result = await GitProcess.exec([
		'show',
		`${commitSha}:` + sourceFilePath.replace(/\\/g, '/')
	], rootDir);

	const out = result.stdout;
	const error = result.stderr;

	if (result.exitCode === 0) {
		return out;
	} else {
		throw error;
	}
}

export async function getChangedFiles(repository: Repository, sha: string): Promise<ReadonlyArray<SlimFileChange>> {
	const args = ['log', sha, '--name-status', '--format=format:', '-z', '-1'];
	const result = await GitProcess.exec(args, repository.path);

	const out = result.stdout;
	const lines = out.split('\0');
	lines.splice(-1, 1);

	const files: SlimFileChange[] = [];
	for (let i = 0; i < lines.length; i++) {
		const statusText = lines[i];
		const status = fromStatus(statusText);
		let originalPath: string | undefined = undefined;

		if (status === GitChangeType.RENAME || status === GitChangeType.COPY) {
			originalPath = lines[++i];
		}

		const path = lines[++i];

		files.push(new SlimFileChange(path, originalPath, status, null));
	}

	return files;
}