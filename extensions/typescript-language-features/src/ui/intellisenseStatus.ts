/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { CommandManager } from '../commands/commandManager';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { ActiveJsTsEditorTracker } from '../utils/activeJsTsEditorTracker';
import { Disposable } from '../utils/dispose';
import { isSupportedLanguageMode, isTypeScriptDocument, jsTsLanguageModes } from '../utils/languageModeIds';
import { isImplicitProjectConfigFile, openOrCreateConfig, openProjectConfigForFile, openProjectConfigOrPromptToCreate, ProjectType } from '../utils/tsconfig';

const localize = nls.loadMessageBundle();


namespace IntellisenseState {
	export const enum Type { None, Pending, Resolved, SyntaxOnly }

	export const None = Object.freeze({ type: Type.None } as const);

	export const SyntaxOnly = Object.freeze({ type: Type.SyntaxOnly } as const);

	export class Pending {
		public readonly type = Type.Pending;

		public readonly cancellation = new vscode.CancellationTokenSource();

		constructor(
			public readonly resource: vscode.Uri,
			public readonly projectType: ProjectType,
		) { }
	}

	export class Resolved {
		public readonly type = Type.Resolved;

		constructor(
			public readonly resource: vscode.Uri,
			public readonly projectType: ProjectType,
			public readonly configFile: string,
		) { }
	}

	export type State = typeof None | Pending | Resolved | typeof SyntaxOnly;
}

export class IntellisenseStatus extends Disposable {

	public readonly openOpenConfigCommandId = '_typescript.openConfig';
	public readonly createConfigCommandId = '_typescript.createConfig';

	private readonly _statusItem: vscode.LanguageStatusItem;

	private _ready = false;
	private _state: IntellisenseState.State = IntellisenseState.None;

	constructor(
		private readonly _client: ITypeScriptServiceClient,
		commandManager: CommandManager,
		private readonly _activeTextEditorManager: ActiveJsTsEditorTracker,
	) {
		super();

		this._statusItem = this._register(vscode.languages.createLanguageStatusItem('typescript.projectStatus', jsTsLanguageModes));
		this._statusItem.name = localize('statusItem.name', "JS/TS IntelliSense Status");

		commandManager.register({
			id: this.openOpenConfigCommandId,
			execute: async (rootPath: string, projectType: ProjectType) => {
				if (this._state.type === IntellisenseState.Type.Resolved) {
					await openProjectConfigOrPromptToCreate(projectType, this._client, rootPath, this._state.configFile);
				} else if (this._state.type === IntellisenseState.Type.Pending) {
					await openProjectConfigForFile(projectType, this._client, this._state.resource);
				}
			},
		});
		commandManager.register({
			id: this.createConfigCommandId,
			execute: async (rootPath: string, projectType: ProjectType) => {
				await openOrCreateConfig(projectType, rootPath, this._client.configuration);
			},
		});

		_activeTextEditorManager.onDidChangeActiveJsTsEditor(this.updateStatus, this, this._disposables);

		this._client.onReady(() => {
			this._ready = true;
			this.updateStatus();
		});
	}

	private async updateStatus() {
		const doc = this._activeTextEditorManager.activeJsTsEditor?.document;
		if (!doc || !isSupportedLanguageMode(doc)) {
			this.updateState(IntellisenseState.None);
			return;
		}

		if (!this._client.hasCapabilityForResource(doc.uri, ClientCapability.Semantic)) {
			this.updateState(IntellisenseState.SyntaxOnly);
			return;
		}

		const file = this._client.toOpenedFilePath(doc, { suppressAlertOnFailure: true });
		if (!file) {
			this.updateState(IntellisenseState.None);
			return;
		}

		if (!this._ready) {
			return;
		}

		const projectType = isTypeScriptDocument(doc) ? ProjectType.TypeScript : ProjectType.JavaScript;

		const pendingState = new IntellisenseState.Pending(doc.uri, projectType);
		this.updateState(pendingState);

		const response = await this._client.execute('projectInfo', { file, needFileNameList: false }, pendingState.cancellation.token);
		if (response.type === 'response' && response.body) {
			if (this._state === pendingState) {
				this.updateState(new IntellisenseState.Resolved(doc.uri, projectType, response.body.configFileName));
			}
		}
	}

	private updateState(newState: IntellisenseState.State): void {
		if (this._state === newState) {
			return;
		}

		if (this._state.type === IntellisenseState.Type.Pending) {
			this._state.cancellation.cancel();
			this._state.cancellation.dispose();
		}

		this._state = newState;

		switch (this._state.type) {
			case IntellisenseState.Type.None:
				break;

			case IntellisenseState.Type.Pending:
				this._statusItem.text = '$(loading~spin)';
				this._statusItem.detail = localize('pending.detail', 'Loading IntelliSense status');
				this._statusItem.command = undefined;
				break;

			case IntellisenseState.Type.Resolved:
				const rootPath = this._client.getWorkspaceRootForResource(this._state.resource);
				if (!rootPath) {
					return;
				}

				if (isImplicitProjectConfigFile(this._state.configFile)) {
					this._statusItem.text = this._state.projectType === ProjectType.TypeScript
						? localize('resolved.detail.noTsConfig', "No tsconfig")
						: localize('resolved.detail.noJsConfig', "No jsconfig");

					this._statusItem.detail = undefined;
					this._statusItem.command = {
						command: this.createConfigCommandId,
						title: this._state.projectType === ProjectType.TypeScript
							? localize('resolved.command.title.createTsconfig', "Create tsconfig")
							: localize('resolved.command.title.createJsconfig', "Create jsconfig"),
						arguments: [rootPath],
					};
				} else {
					this._statusItem.text = vscode.workspace.asRelativePath(this._state.configFile);
					this._statusItem.detail = undefined;
					this._statusItem.command = {
						command: this.openOpenConfigCommandId,
						title: localize('resolved.command.title.open', "Open config file"),
						arguments: [rootPath],
					};
				}
				break;

			case IntellisenseState.Type.SyntaxOnly:
				this._statusItem.text = localize('syntaxOnly.text', 'Partial Mode');
				this._statusItem.detail = localize('syntaxOnly.detail', 'Project Wide IntelliSense not available');
				this._statusItem.command = {
					title: localize('syntaxOnly.command.title.learnMore', "Learn More"),
					command: 'vscode.open',
					arguments: [
						vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=2114477'), // TODO: add proper link once published
					]
				};
				break;
		}
	}
}
