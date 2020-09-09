/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionTipsService, IConfigBasedExtensionTip } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionRecommendations, ExtensionRecommendation, PromptedExtensionRecommendations } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { localize } from 'vs/nls';
import { ExtensionRecommendationReason } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent } from 'vs/platform/workspace/common/workspace';
import { Emitter } from 'vs/base/common/event';

export class ConfigBasedRecommendations extends ExtensionRecommendations {

	private importantTips: IConfigBasedExtensionTip[] = [];
	private otherTips: IConfigBasedExtensionTip[] = [];

	private _onDidChangeRecommendations = this._register(new Emitter<void>());
	readonly onDidChangeRecommendations = this._onDidChangeRecommendations.event;

	private _otherRecommendations: ExtensionRecommendation[] = [];
	get otherRecommendations(): ReadonlyArray<ExtensionRecommendation> { return this._otherRecommendations; }

	private _importantRecommendations: ExtensionRecommendation[] = [];
	get importantRecommendations(): ReadonlyArray<ExtensionRecommendation> { return this._importantRecommendations; }

	get recommendations(): ReadonlyArray<ExtensionRecommendation> { return [...this.importantRecommendations, ...this.otherRecommendations]; }

	constructor(
		promptedExtensionRecommendations: PromptedExtensionRecommendations,
		@IExtensionTipsService private readonly extensionTipsService: IExtensionTipsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super(promptedExtensionRecommendations);
	}

	protected async doActivate(): Promise<void> {
		await this.fetch();
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(e => this.onWorkspaceFoldersChanged(e)));
	}

	private async fetch(): Promise<void> {
		const workspace = this.workspaceContextService.getWorkspace();
		const importantTips: Map<string, IConfigBasedExtensionTip> = new Map<string, IConfigBasedExtensionTip>();
		const otherTips: Map<string, IConfigBasedExtensionTip> = new Map<string, IConfigBasedExtensionTip>();
		for (const folder of workspace.folders) {
			const configBasedTips = await this.extensionTipsService.getConfigBasedTips(folder.uri);
			for (const tip of configBasedTips) {
				if (tip.important) {
					importantTips.set(tip.extensionId, tip);
				} else {
					otherTips.set(tip.extensionId, tip);
				}
			}
		}
		this.importantTips = [...importantTips.values()];
		this.otherTips = [...otherTips.values()].filter(tip => !importantTips.has(tip.extensionId));
		this._otherRecommendations = this.otherTips.map(tip => this.toExtensionRecommendation(tip));
		this._importantRecommendations = this.importantTips.map(tip => this.toExtensionRecommendation(tip));
	}

	private async onWorkspaceFoldersChanged(event: IWorkspaceFoldersChangeEvent): Promise<void> {
		if (event.added.length) {
			const oldImportantRecommended = this.importantTips;
			await this.fetch();
			// Suggest only if at least one of the newly added recommendations was not suggested before
			if (this.importantTips.some(current => oldImportantRecommended.every(old => current.extensionId !== old.extensionId))) {
				this._onDidChangeRecommendations.fire();
			}
		}
	}

	private toExtensionRecommendation(tip: IConfigBasedExtensionTip): ExtensionRecommendation {
		return {
			extensionId: tip.extensionId,
			source: 'config',
			reason: {
				reasonId: ExtensionRecommendationReason.WorkspaceConfig,
				reasonText: localize('exeBasedRecommendation', "This extension is recommended because of the current workspace configuration")
			}
		};
	}

}
