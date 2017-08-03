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
import TsConfigProvider, { TSConfig } from '../utils/tsconfigProvider';
import { isImplicitProjectConfigFile } from '../utils/tsconfig';


import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

const exists = (file: string): Promise<boolean> =>
	new Promise<boolean>((resolve, _reject) => {
		fs.exists(file, (value: boolean) => {
			resolve(value);
		});
	});


interface TypeScriptTaskDefinition extends vscode.TaskDefinition {
	tsconfig: string;
}

/**
 * Provides tasks for building `tsconfig.json` files in a project.
 */
class TscTaskProvider implements vscode.TaskProvider {
	private readonly tsconfigProvider: TsConfigProvider;

	public constructor(
		private readonly lazyClient: () => TypeScriptServiceClient
	) {
		this.tsconfigProvider = new TsConfigProvider();
	}

	public async provideTasks(token: vscode.CancellationToken): Promise<vscode.Task[]> {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || !folders.length) {
			return [];
		}

		const configPaths: Set<string> = new Set();
		const tasks: vscode.Task[] = [];
		for (const project of await this.getAllTsConfigs(token)) {
			if (!configPaths.has(project.path)) {
				configPaths.add(project.path);
				tasks.push(await this.getBuildTaskForProject(project));
			}
		}
		return tasks;
	}

	public resolveTask(_task: vscode.Task): vscode.Task | undefined {
		return undefined;
	}

	private async getAllTsConfigs(token: vscode.CancellationToken): Promise<TSConfig[]> {
		const out = new Set<TSConfig>();
		const configs = (await this.getTsConfigForActiveFile(token)).concat(await this.getTsConfigsInWorkspace());
		for (const config of configs) {
			if (await exists(config.path)) {
				out.add(config);
			}
		}
		return Array.from(out);
	}

	private async getTsConfigForActiveFile(token: vscode.CancellationToken): Promise<TSConfig[]> {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			if (path.basename(editor.document.fileName).match(/^tsconfig\.(.\.)?json$/)) {
				const path = editor.document.uri;
				return [{
					path: path.fsPath,
					workspaceFolder: vscode.workspace.getWorkspaceFolder(path)
				}];
			}
		}

		const file = this.getActiveTypeScriptFile();
		if (!file) {
			return [];
		}

		try {
			const res: Proto.ProjectInfoResponse = await this.lazyClient().execute(
				'projectInfo',
				{ file, needFileNameList: false } as protocol.ProjectInfoRequestArgs,
				token);

			if (!res || !res.body) {
				return [];
			}

			const { configFileName } = res.body;
			if (configFileName && !isImplicitProjectConfigFile(configFileName)) {
				const path = vscode.Uri.file(configFileName);
				const folder = vscode.workspace.getWorkspaceFolder(path);
				return [{
					path: configFileName,
					workspaceFolder: folder
				}];
			}
		}
		catch (e) {
			// noop
		}
		return [];
	}

	private async getTsConfigsInWorkspace(): Promise<TSConfig[]> {
		return Array.from(await this.tsconfigProvider.getConfigsForWorkspace());
	}

	private async getCommand(project: TSConfig): Promise<string> {
		if (project.workspaceFolder) {
			const platform = process.platform;
			const bin = path.join(project.workspaceFolder.uri.fsPath, 'node_modules', '.bin');
			if (platform === 'win32' && await exists(path.join(bin, 'tsc.cmd'))) {
				return path.join(bin, 'tsc.cmd');
			} else if ((platform === 'linux' || platform === 'darwin') && await exists(path.join(bin, 'tsc'))) {
				return path.join(bin, 'tsc');
			}
		}
		return 'tsc';
	}

	private shouldUseWatchForBuild(configFile: TSConfig): boolean {
		try {
			const config = JSON.parse(fs.readFileSync(configFile.path, 'utf-8'));
			if (config) {
				return !!config.compileOnSave;
			}
		} catch (e) {
			// noop
		}
		return false;
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

	private async getBuildTaskForProject(project: TSConfig): Promise<vscode.Task> {
		const command = await this.getCommand(project);

		let label: string = project.path;
		if (project.workspaceFolder) {
			const relativePath = path.relative(project.workspaceFolder.uri.fsPath, project.path);
			if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
				label = path.join(project.workspaceFolder.name, relativePath);
			} else {
				label = relativePath;
			}
		}

		const watch = false && this.shouldUseWatchForBuild(project);
		const identifier: TypeScriptTaskDefinition = { type: 'typescript', tsconfig: label };
		const buildTask = new vscode.Task(
			identifier,
			watch
				? localize('buildAndWatchTscLabel', 'watch - {0}', label)
				: localize('buildTscLabel', 'build - {0}', label),
			'tsc',
			new vscode.ShellExecution(`${command} ${watch ? '--watch' : ''} -p "${project.path}"`),
			watch
				? '$tsc-watch'
				: '$tsc'
		);
		buildTask.group = vscode.TaskGroup.Build;
		buildTask.isBackground = watch;
		return buildTask;
	}
}

type AutoDetect = 'on' | 'off';

/**
 * Manages registrations of TypeScript task provides with VScode.
 */
export default class TypeScriptTaskProviderManager {
	private taskProviderSub: vscode.Disposable | undefined = undefined;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(
		private readonly lazyClient: () => TypeScriptServiceClient
	) {
		vscode.workspace.onDidChangeConfiguration(this.onConfigurationChanged, this, this.disposables);
		this.onConfigurationChanged();
	}

	dispose() {
		if (this.taskProviderSub) {
			this.taskProviderSub.dispose();
			this.taskProviderSub = undefined;
		}
		this.disposables.forEach(x => x.dispose());
	}

	private onConfigurationChanged() {
		let autoDetect = vscode.workspace.getConfiguration('typescript.tsc').get<AutoDetect>('autoDetect');
		if (this.taskProviderSub && autoDetect === 'off') {
			this.taskProviderSub.dispose();
			this.taskProviderSub = undefined;
		} else if (!this.taskProviderSub && autoDetect === 'on') {
			this.taskProviderSub = vscode.workspace.registerTaskProvider('typescript', new TscTaskProvider(this.lazyClient));
		}
	}
}