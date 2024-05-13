/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as interfaces from './interfaces';

export default class MergeConflictCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
	private codeLensRegistrationHandle?: vscode.Disposable | null;
	private config?: interfaces.IExtensionConfiguration;
	private tracker: interfaces.IDocumentMergeConflictTracker;

	constructor(trackerService: interfaces.IDocumentMergeConflictTrackerService) {
		this.tracker = trackerService.createTracker('codelens');
	}

	begin(config: interfaces.IExtensionConfiguration) {
		this.config = config;

		if (this.config.enableCodeLens) {
			this.registerCodeLensProvider();
		}
	}

	configurationUpdated(updatedConfig: interfaces.IExtensionConfiguration) {

		if (updatedConfig.enableCodeLens === false && this.codeLensRegistrationHandle) {
			this.codeLensRegistrationHandle.dispose();
			this.codeLensRegistrationHandle = null;
		}
		else if (updatedConfig.enableCodeLens === true && !this.codeLensRegistrationHandle) {
			this.registerCodeLensProvider();
		}

		this.config = updatedConfig;
	}


	dispose() {
		if (this.codeLensRegistrationHandle) {
			this.codeLensRegistrationHandle.dispose();
			this.codeLensRegistrationHandle = null;
		}
	}

	async provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.CodeLens[] | null> {

		if (!this.config || !this.config.enableCodeLens) {
			return null;
		}

		const conflicts = await this.tracker.getConflicts(document);
		const conflictsCount = conflicts?.length ?? 0;
		vscode.commands.executeCommand('setContext', 'mergeConflictsCount', conflictsCount);

		if (!conflictsCount) {
			return null;
		}

		const items: vscode.CodeLens[] = [];

		conflicts.forEach(conflict => {
			const acceptCurrentCommand: vscode.Command = {
				command: 'merge-conflict.accept.current',
				title: vscode.l10n.t("Accept Current Change"),
				arguments: ['known-conflict', conflict]
			};

			const acceptIncomingCommand: vscode.Command = {
				command: 'merge-conflict.accept.incoming',
				title: vscode.l10n.t("Accept Incoming Change"),
				arguments: ['known-conflict', conflict]
			};

			const acceptBothCommand: vscode.Command = {
				command: 'merge-conflict.accept.both',
				title: vscode.l10n.t("Accept Both Changes"),
				arguments: ['known-conflict', conflict]
			};

			const diffCommand: vscode.Command = {
				command: 'merge-conflict.compare',
				title: vscode.l10n.t("Compare Changes"),
				arguments: [conflict]
			};

			const range = document.lineAt(conflict.range.start.line).range;
			items.push(
				new vscode.CodeLens(range, acceptCurrentCommand),
				new vscode.CodeLens(range, acceptIncomingCommand),
				new vscode.CodeLens(range, acceptBothCommand),
				new vscode.CodeLens(range, diffCommand)
			);
		});

		return items;
	}

	private registerCodeLensProvider() {
		this.codeLensRegistrationHandle = vscode.languages.registerCodeLensProvider([
			{ scheme: 'file' },
			{ scheme: 'vscode-vfs' },
			{ scheme: 'untitled' },
			{ scheme: 'vscode-userdata' },
		], this);
	}
}
