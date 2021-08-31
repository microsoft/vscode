/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { CommandManager } from '../commands/commandManager';
import { ITypeScriptServiceClient } from '../typescriptService';
import { ActiveJsTsEditorTracker } from '../utils/activeJsTsEditorTracker';
import { Disposable } from '../utils/dispose';
import * as languageModeIds from '../utils/languageModeIds';
import { isImplicitProjectConfigFile, openOrCreateConfig, openProjectConfigForFile, openProjectConfigOrPromptToCreate, ProjectType } from '../utils/tsconfig';

const localize = nls.loadMessageBundle();


namespace ProjectInfoState {
	export const enum Type { None, Pending, Resolved }

	export const None = Object.freeze({ type: Type.None } as const);

	export class Pending {
		public readonly type = Type.Pending;

		public readonly cancellation = new vscode.CancellationTokenSource();

		constructor(
			public readonly resource: vscode.Uri,
		) { }
	}

	export class Resolved {
		public readonly type = Type.Resolved;

		constructor(
			public readonly resource: vscode.Uri,
			public readonly configFile: string,
		) { }
	}

	export type State = typeof None | Pending | Resolved;
}

export class ProjectStatus extends Disposable {

	public readonly openOpenConfigCommandId = '_typescript.openConfig';
	public readonly createConfigCommandId = '_typescript.createConfig';

	private readonly _statusItem: vscode.LanguageStatusItem;

	private _ready = false;
	private _state: ProjectInfoState.State = ProjectInfoState.None;

	constructor(
		private readonly _client: ITypeScriptServiceClient,
		commandManager: CommandManager,
		private readonly _activeTextEditorManager: ActiveJsTsEditorTracker,
	) {
		super();

		this._statusItem = this._register(vscode.languages.createLanguageStatusItem('typescript.projectStatus', [
			languageModeIds.javascript,
			languageModeIds.javascriptreact,
			languageModeIds.typescript,
			languageModeIds.typescriptreact,
		]));

		commandManager.register({
			id: this.openOpenConfigCommandId,
			execute: async (rootPath: string) => {
				if (this._state.type === ProjectInfoState.Type.Resolved) {
					await openProjectConfigOrPromptToCreate(ProjectType.TypeScript, this._client, rootPath, this._state.configFile);
				} else if (this._state.type === ProjectInfoState.Type.Pending) {
					await openProjectConfigForFile(ProjectType.TypeScript, this._client, this._state.resource);
				}
			},
		});
		commandManager.register({
			id: this.createConfigCommandId,
			execute: async (rootPath: string) => {
				await openOrCreateConfig(ProjectType.TypeScript, rootPath, this._client.configuration);
			},
		});

		_activeTextEditorManager.onDidChangeActiveJsTsEditor(this.updateStatus, this, this._disposables);

		this._client.onReady(() => {
			this._ready = true;
			this.updateStatus();
		});
	}

	private async updateStatus() {
		const editor = this._activeTextEditorManager.activeJsTsEditor;
		if (!editor) {
			this.updateState(ProjectInfoState.None);
			return;
		}

		const doc = editor.document;
		if (languageModeIds.isTypeScriptDocument(doc)) {
			const file = this._client.toOpenedFilePath(doc, { suppressAlertOnFailure: true });
			if (file) {
				if (!this._ready) {
					return;
				}

				const pendingState = new ProjectInfoState.Pending(doc.uri);
				this.updateState(pendingState);

				const response = await this._client.execute('projectInfo', { file, needFileNameList: false }, pendingState.cancellation.token);
				if (response.type === 'response' && response.body) {
					if (this._state === pendingState) {
						this.updateState(new ProjectInfoState.Resolved(doc.uri, response.body.configFileName));
					}
				}
				return;
			}
		}

		this.updateState(ProjectInfoState.None);
	}

	private updateState(newState: ProjectInfoState.State): void {
		if (this._state === newState) {
			return;
		}

		if (this._state.type === ProjectInfoState.Type.Pending) {
			this._state.cancellation.cancel();
			this._state.cancellation.dispose();
		}

		this._state = newState;

		const rootPath = this._state.type === ProjectInfoState.Type.Resolved ? this._client.getWorkspaceRootForResource(this._state.resource) : undefined;
		if (!rootPath) {
			return;
		}

		if (this._state.type === ProjectInfoState.Type.Resolved) {
			if (isImplicitProjectConfigFile(this._state.configFile)) {
				this._statusItem.text = localize('create.text', "This file is currently not part of a tsconfig/jsconfig project");
				this._statusItem.detail = '';
				this._statusItem.command = {
					command: this.createConfigCommandId,
					title: localize('create.command', "Create tsconfig"),
					tooltip: localize('create.command', "Create tsconfig"),
					arguments: [rootPath],
				};
				return;
			}
		}

		this._statusItem.text = localize('open.text', "Project config");
		this._statusItem.detail = this._state.type === ProjectInfoState.Type.Resolved ? vscode.workspace.asRelativePath(this._state.configFile) : '';
		this._statusItem.command = {
			command: this.openOpenConfigCommandId,
			title: localize('open.command', "Open tsconfig"),
			tooltip: localize('open.command', "Open tsconfig"),
			arguments: [rootPath],
		};
	}
}
