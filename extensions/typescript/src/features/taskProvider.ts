/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as Proto from '../protocol';
import TypeScriptServiceClient from '../typescriptServiceClient';


const exists = (file: string): Promise<boolean> =>
	new Promise<boolean>((resolve, _reject) => {
		fs.exists(file, (value: boolean) => {
			resolve(value);
		});
	});

export default class TypeScriptTaskProvider implements vscode.TaskProvider {

	public constructor(
		private readonly lazyClient: () => TypeScriptServiceClient
	) { }

	async provideTasks(token: vscode.CancellationToken): Promise<vscode.Task[]> {
		const rootPath = vscode.workspace.rootPath;
		if (!rootPath) {
			return [];
		}

		const projects = (await this.getConfigForActiveFile(token)).concat(await this.getConfigsForWorkspace());
		const command = await this.getCommand();

		return projects
			.filter((x, i) => projects.indexOf(x) === i)
			.map(configFile => {
				const configFileName = path.relative(rootPath, configFile);
				const buildTask = new vscode.ShellTask(`tsc: build ${configFileName}`, `${command} -p ${configFile}`, '$tsc');
				buildTask.group = vscode.TaskGroup.Build;
				return buildTask;
			});
	}


	private async getConfigForActiveFile(token: vscode.CancellationToken): Promise<string[]> {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			if (path.basename(editor.document.fileName).match(/^tsconfig\.(.\.)?json$/)) {
				return [editor.document.fileName];
			}
		}

		const file = this.getActiveTypeScriptFile();
		if (!file) {
			return [];
		}

		const res: Proto.ProjectInfoResponse = await this.lazyClient().execute(
			'projectInfo',
			{ file, needFileNameList: false } as protocol.ProjectInfoRequestArgs,
			token);

		if (!res || !res.body) {
			return [];
		}

		const { configFileName } = res.body;
		if (configFileName && configFileName.indexOf('/dev/null/') !== 0) {
			return [configFileName];
		}
		return [];
	}

	private async getConfigsForWorkspace(): Promise<string[]> {
		if (!vscode.workspace.rootPath) {
			return [];
		}
		const rootTsConfig = path.join(vscode.workspace.rootPath, 'tsconfig.json');
		if (!await exists(rootTsConfig)) {
			return [];
		}
		return [rootTsConfig];
	}

	private async getCommand(): Promise<string> {
		const platform = process.platform;
		if (platform === 'win32' && await exists(path.join(vscode.workspace.rootPath!, 'node_modules', '.bin', 'tsc.cmd'))) {
			return path.join('.', 'node_modules', '.bin', 'tsc.cmd');
		} else if ((platform === 'linux' || platform === 'darwin') && await exists(path.join(vscode.workspace.rootPath!, 'node_modules', '.bin', 'tsc'))) {
			return path.join('.', 'node_modules', '.bin', 'tsc');
		} else {
			return 'tsc';
		}
	}

	private getActiveTypeScriptFile(): string | null {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			if (document && (document.languageId === 'typescript' || document.languageId === 'typescriptreact')) {
				return this.lazyClient().normalizePath(document.uri);
			}
		}
		return null;
	}
}