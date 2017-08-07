/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Proto from '../protocol';
import * as vscode from 'vscode';
import * as fs from 'fs';

import { ITypescriptServiceClient } from '../typescriptService';
import { Delayer } from './async';
import { isImplicitProjectConfigFile } from './tsconfig';

interface PendingProjectUpdate {
	delayer: Delayer<void>;
	files: Set<string>;
}

class ProjectDelayer {
	private readonly pendingProjectUpdates = new Map<string, PendingProjectUpdate>();

	constructor(
		private task: (project: string, fileNames: Set<string>) => void
	) { }

	dispose() {
		for (const update of this.pendingProjectUpdates.values()) {
			update.delayer.cancel();
		}
		this.pendingProjectUpdates.clear();
	}

	public trigger(projectFileName: string, fileNames: string[]): void {
		if (!fileNames.length) {
			return;
		}

		let entry: PendingProjectUpdate | undefined = this.pendingProjectUpdates.get(projectFileName);
		if (!entry) {
			entry = {
				delayer: new Delayer<void>(500),
				files: new Set()
			};
			this.pendingProjectUpdates.set(projectFileName, entry);
		}

		for (const file of fileNames) {
			entry.files.add(file);
		}

		entry.delayer.trigger(() => this.onDidTrigger(projectFileName));
	}

	private onDidTrigger(projectFileName: string): void {
		const entry = this.pendingProjectUpdates.get(projectFileName);
		if (!entry) {
			return;
		}
		this.task(projectFileName, entry.files);
		this.pendingProjectUpdates.delete(projectFileName);
	}
}

export default class CompileOnSaveHelper {
	private saveSubscription: vscode.Disposable;

	private readonly emitter: ProjectDelayer;

	constructor(
		private client: ITypescriptServiceClient,
		private languages: string[],
		private readonly syntaxDiagnosticsReceived: (file: string, diag: protocol.Diagnostic[]) => void,
		private readonly semanticsDiagnosticsReceived: (file: string, diag: protocol.Diagnostic[]) => void
	) {
		this.emitter = new ProjectDelayer((project, files) => this.emit(project, files));
		this.saveSubscription = vscode.workspace.onDidSaveTextDocument(this.onDidSave, this);
	}

	dispose() {
		this.saveSubscription.dispose();
		this.emitter.dispose();
	}

	private async onDidSave(textDocument: vscode.TextDocument) {
		if (this.languages.indexOf(textDocument.languageId) === -1) {
			return;
		}

		const file = this.client.normalizePath(textDocument.uri);
		if (!file || !await this.isFileInCompileOnSaveEnabledProject(file)) {
			return;
		}

		const affectedFileList = await this.client.execute('compileOnSaveAffectedFileList', { file });
		if (!affectedFileList || !affectedFileList.body) {
			return;
		}

		for (const project of affectedFileList.body) {
			this.emitter.trigger(project.projectFileName, project.fileNames);
		}
	}

	private async isFileInCompileOnSaveEnabledProject(file: string): Promise<boolean> {
		const info = await this.client.execute('projectInfo', { file, needFileNameList: false });
		if (!info || !info.body || !info.body.configFileName || isImplicitProjectConfigFile(info.body.configFileName)) {
			return false;
		}

		const config = JSON.parse(fs.readFileSync(info.body.configFileName, 'utf8'));
		return config && config.compileOnSave;
	}

	private emit(_project: string, files: Set<string>): void {
		if (!files.size) {
			return;
		}

		for (const file of files) {
			this.client.execute('compileOnSaveEmitFile', { file }, false);

			this.client.execute('semanticDiagnosticsSync', { file }).then(resp => {
				if (resp && resp.body) {
					this.semanticsDiagnosticsReceived(file, resp.body as Proto.Diagnostic[]);
				}
			});

			this.client.execute('syntaxDiagnosticsSync', { file }).then(resp => {
				if (resp && resp.body) {
					this.syntaxDiagnosticsReceived(file, resp.body as Proto.Diagnostic[]);
				}
			});
		}
	}
}
