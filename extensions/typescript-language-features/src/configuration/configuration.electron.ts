/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as fs from 'fs';
import { BaseServiceConfigurationProvider } from './configuration';
import { RelativeWorkspacePathResolver } from '../utils/relativePathResolver';

export class ElectronServiceConfigurationProvider extends BaseServiceConfigurationProvider {

	private fixPathPrefixes(inspectValue: string): string {
		const pathPrefixes = ['~' + path.sep];
		for (const pathPrefix of pathPrefixes) {
			if (inspectValue.startsWith(pathPrefix)) {
				return path.join(os.homedir(), inspectValue.slice(pathPrefix.length));
			}
		}
		return inspectValue;
	}

	protected readGlobalTsdk(configuration: vscode.WorkspaceConfiguration): string | null {
		const inspect = configuration.inspect('typescript.tsdk');
		if (inspect && typeof inspect.globalValue === 'string') {
			return this.fixPathPrefixes(inspect.globalValue);
		}
		return null;
	}

	protected readLocalTsdk(configuration: vscode.WorkspaceConfiguration): string | null {
		const inspect = configuration.inspect('typescript.tsdk');
		if (inspect && typeof inspect.workspaceValue === 'string') {
			return this.fixPathPrefixes(inspect.workspaceValue);
		}
		return null;
	}

	protected readLocalNodePath(configuration: vscode.WorkspaceConfiguration): string | null {
		return this.validatePath(this.readLocalNodePathWorker(configuration));
	}

	private readLocalNodePathWorker(configuration: vscode.WorkspaceConfiguration): string | null {
		const inspect = configuration.inspect('typescript.tsserver.nodePath');
		if (inspect?.workspaceValue && typeof inspect.workspaceValue === 'string') {
			if (inspect.workspaceValue === 'node') {
				return this.findNodePath();
			}
			const fixedPath = this.fixPathPrefixes(inspect.workspaceValue);
			if (!path.isAbsolute(fixedPath)) {
				const workspacePath = RelativeWorkspacePathResolver.asAbsoluteWorkspacePath(fixedPath);
				return workspacePath || null;
			}
			return fixedPath;
		}
		return null;
	}

	protected readGlobalNodePath(configuration: vscode.WorkspaceConfiguration): string | null {
		return this.validatePath(this.readGlobalNodePathWorker(configuration));
	}

	private readGlobalNodePathWorker(configuration: vscode.WorkspaceConfiguration): string | null {
		const inspect = configuration.inspect('typescript.tsserver.nodePath');
		if (inspect?.globalValue && typeof inspect.globalValue === 'string') {
			if (inspect.globalValue === 'node') {
				return this.findNodePath();
			}
			const fixedPath = this.fixPathPrefixes(inspect.globalValue);
			if (path.isAbsolute(fixedPath)) {
				return fixedPath;
			}
		}
		return null;
	}

	private findNodePath(): string | null {
		try {
			const out = child_process.execFileSync('node', ['-e', 'console.log(process.execPath)'], {
				windowsHide: true,
				timeout: 2000,
				cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath,
				encoding: 'utf-8',
			});
			return out.trim();
		} catch (error) {
			vscode.window.showWarningMessage(vscode.l10n.t("Could not detect a Node installation to run TS Server."));
			return null;
		}
	}

	private validatePath(nodePath: string | null): string | null {
		if (nodePath && (!fs.existsSync(nodePath) || fs.lstatSync(nodePath).isDirectory())) {
			vscode.window.showWarningMessage(vscode.l10n.t("The path {0} doesn\'t point to a valid Node installation to run TS Server. Falling back to bundled Node.", nodePath));
			return null;
		}
		return nodePath;
	}
}
