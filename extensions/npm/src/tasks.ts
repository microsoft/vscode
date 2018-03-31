/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TaskDefinition, Task, WorkspaceFolder, Uri, workspace } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface NpmTaskDefinition extends TaskDefinition {
	script: string;
	path?: string;
}

export function isWorkspaceFolder(value: any): value is WorkspaceFolder {
	return value && typeof value !== 'number';
}

export function getPackageManager(folder: WorkspaceFolder): string {
	return workspace.getConfiguration('npm', folder.uri).get<string>('packageManager', 'npm');
}

export function getPackageJsonUriFromTask(task: Task): Uri | null {
	if (isWorkspaceFolder(task.scope)) {
		if (task.definition.path) {
			return Uri.file(path.join(task.scope.uri.fsPath, task.definition.path, 'package.json'));
		} else {
			return Uri.file(path.join(task.scope.uri.fsPath, 'package.json'));
		}
	}
	return null;
}

export async function exists(file: string): Promise<boolean> {
	return new Promise<boolean>((resolve, _reject) => {
		fs.exists(file, (value) => {
			resolve(value);
		});
	});
}

export async function readFile(file: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		fs.readFile(file, (err, data) => {
			if (err) {
				reject(err);
			}
			resolve(data.toString());
		});
	});
}

export async function getScripts(packageJsonUri: Uri, localize: any): Promise<any> {

	if (packageJsonUri.scheme !== 'file') {
		return null;
	}

	let packageJson = packageJsonUri.fsPath;
	if (!await exists(packageJson)) {
		return null;
	}

	try {
		var contents = await readFile(packageJson);
		var json = JSON.parse(contents);
		return json.scripts;
	} catch (e) {
		let localizedParseError = localize('npm.parseError', 'Npm task detection: failed to parse the file {0}', packageJsonUri);
		throw new Error(localizedParseError);
	}
}
