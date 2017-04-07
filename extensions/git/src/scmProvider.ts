/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { scm, Uri, Disposable, SourceControl, SourceControlResourceGroup, Event, workspace, commands } from 'vscode';
import { Model, State } from './model';
import { StatusBarCommands } from './statusbar';
import { CommandCenter } from './commands';
import { mapEvent } from './util';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class GitSCMProvider {

	private disposables: Disposable[] = [];
	get contextKey(): string { return 'git'; }

	get onDidChange(): Event<this> {
		return mapEvent(this.model.onDidChange, () => this);
	}

	get label(): string { return 'Git'; }

	get stateContextKey(): string {
		switch (this.model.state) {
			case State.Uninitialized: return 'uninitialized';
			case State.Idle: return 'idle';
			case State.NotAGitRepository: return 'norepo';
			default: return '';
		}
	}

	get count(): number {
		const countBadge = workspace.getConfiguration('git').get<string>('countBadge');

		switch (countBadge) {
			case 'off': return 0;
			case 'tracked': return this.model.indexGroup.resources.length;
			default:
				return this.model.mergeGroup.resources.length
					+ this.model.indexGroup.resources.length
					+ this.model.workingTreeGroup.resources.length;
		}
	}

	private _sourceControl: SourceControl;

	get sourceControl(): SourceControl {
		return this._sourceControl;
	}

	private mergeGroup: SourceControlResourceGroup;
	private indexGroup: SourceControlResourceGroup;
	private workingTreeGroup: SourceControlResourceGroup;

	constructor(
		private model: Model,
		private commandCenter: CommandCenter,
		private statusBarCommands: StatusBarCommands
	) {
		this._sourceControl = scm.createSourceControl('git', 'Git');
		this.disposables.push(this._sourceControl);

		this._sourceControl.acceptInputCommand = { command: 'git.commitWithInput', title: localize('commit', "Commit") };
		this._sourceControl.quickDiffProvider = this;

		this.statusBarCommands.onDidChange(this.onDidStatusBarCommandsChange, this, this.disposables);
		this.onDidStatusBarCommandsChange();

		this.mergeGroup = this._sourceControl.createResourceGroup(model.mergeGroup.id, model.mergeGroup.label);
		this.indexGroup = this._sourceControl.createResourceGroup(model.indexGroup.id, model.indexGroup.label);
		this.workingTreeGroup = this._sourceControl.createResourceGroup(model.workingTreeGroup.id, model.workingTreeGroup.label);

		this.mergeGroup.hideWhenEmpty = true;
		this.indexGroup.hideWhenEmpty = true;

		this.disposables.push(this.mergeGroup);
		this.disposables.push(this.indexGroup);
		this.disposables.push(this.workingTreeGroup);

		model.onDidChange(this.onDidModelChange, this, this.disposables);
		this.updateCommitTemplate();
	}

	private async updateCommitTemplate(): Promise<void> {
		try {
			this._sourceControl.commitTemplate = await this.model.getCommitTemplate();
		} catch (e) {
			// noop
		}
	}

	provideOriginalResource(uri: Uri): Uri | undefined {
		if (uri.scheme !== 'file') {
			return;
		}

		// As a mitigation for extensions like ESLint showing warnings and errors
		// for git URIs, let's change the file extension of these uris to .git.
		return new Uri().with({ scheme: 'git-original', query: uri.path, path: uri.path + '.git' });
	}

	private onDidModelChange(): void {
		this.mergeGroup.resourceStates = this.model.mergeGroup.resources;
		this.indexGroup.resourceStates = this.model.indexGroup.resources;
		this.workingTreeGroup.resourceStates = this.model.workingTreeGroup.resources;
		this._sourceControl.count = this.count;
		commands.executeCommand('setContext', 'gitState', this.stateContextKey);
	}

	private onDidStatusBarCommandsChange(): void {
		this._sourceControl.statusBarCommands = this.statusBarCommands.commands;
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}