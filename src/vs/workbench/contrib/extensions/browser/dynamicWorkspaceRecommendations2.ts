/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IFileService } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceTagsService } from 'vs/workbench/contrib/tags/common/workspaceTags';
import { ExtensionRecommendations, ExtensionRecommendation } from 'vs/workbench/contrib/extensions/browser/extensionRecommendations';
import { ExtensionRecommendationReason } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';
import { localize } from 'vs/nls';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { extname } from 'vs/base/common/resources';
import { Emitter } from 'vs/base/common/event';

type DynamicWorkspaceRecommendationsClassification = {
	owner: 'sandy081';
	comment: 'Information about recommendations by scanning the workspace';
	count: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of extensions those are recommended' };
	cache: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Flag if extensions are recommended from cache or not' };
};

type IStoredDynamicWorkspaceRecommendations = { recommendations: string[]; timestamp: number };
const dynamicWorkspaceRecommendationsStorageKey = 'extensionsAssistant/dynamicWorkspaceRecommendations2';

export class DynamicWorkspaceRecommendations extends ExtensionRecommendations {

	private _recommendations: ExtensionRecommendation[] = [];
	get recommendations(): ReadonlyArray<ExtensionRecommendation> { return this._recommendations; }

	private _onDidChangeRecommendations = this._register(new Emitter<void>());
	readonly onDidChangeRecommendations = this._onDidChangeRecommendations.event;

	constructor(
		@IExtensionTipsService private readonly extensionTipsService: IExtensionTipsService,
		@IWorkspaceTagsService private readonly workspaceTagsService: IWorkspaceTagsService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
	) {
		super();
	}

	protected async doActivate(): Promise<void> {
		await this.fetch();
		this._register(this.contextService.onDidChangeWorkbenchState(() => this._recommendations = []));
		this._register(this.extensionService.onDidChangeExtensions(e => this.onExtensionsChanged()));
		this._register(this.editorGroupsService.onDidAddGroup(e => this.onExtensionsChanged()));
	}

	async onExtensionsChanged(): Promise<void> {
		const oldRecommendations = this._recommendations;
		this._recommendations = [];
		await this.fetch();
		if (this._recommendations.some(current => oldRecommendations.every(old => current.extensionId !== old.extensionId))) {
			this._onDidChangeRecommendations.fire();
		}
	}

	/**
	 * Fetch extensions used by others on the same workspace as recommendations
	 */
	private async fetch(): Promise<void> {
		this._register(this.contextService.onDidChangeWorkbenchState(() => this._recommendations = []));

		if (this._recommendations.length
			|| this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER
			|| !this.fileService.hasProvider(this.contextService.getWorkspace().folders[0].uri)
		) {
			return;
		}

		const folder = this.contextService.getWorkspace().folders[0];
		const tags = await this.workspaceTagsService.getTags();
		const workspaceDependencies = Object.keys(tags).reduce<string[]>((result, key) => tags[key] === true ? [...result, key] : result, []);
		const extensionsStatus = this.extensionService.getExtensionsStatus();
		// FIXME: Only gets one file usually while 2 editors are open.
		const opneFileTypes = this.editorGroupsService.groups.reduce<string[]>((result, group) => result.concat(group.editors.map(editor => editor.resource ? extname(editor.resource) : '')), []);

		const activeExtensions = Object.keys(extensionsStatus).reduce<string[]>((result, key) => extensionsStatus[key].activationTimes ? [...result, key] : result, []);
		const recommendations = await this.extensionTipsService.getDynamicWrokspaceTips(this.contextService.getWorkspace(), workspaceDependencies, opneFileTypes, activeExtensions);
		this._recommendations = recommendations.map(id => this.toExtensionRecommendation(id, folder));
		this.storageService.store(dynamicWorkspaceRecommendationsStorageKey, JSON.stringify(<IStoredDynamicWorkspaceRecommendations>{ recommendations, timestamp: Date.now() }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.telemetryService.publicLog2<{ count: number; cache: number }, DynamicWorkspaceRecommendationsClassification>('dynamicWorkspaceRecommendations2', { count: this._recommendations.length, cache: 0 });
		console.log(JSON.stringify(this._recommendations, null, 2));

	}

	private toExtensionRecommendation(extensionId: string, folder: IWorkspaceFolder): ExtensionRecommendation {
		return {
			extensionId: extensionId.toLowerCase(),
			reason: {
				reasonId: ExtensionRecommendationReason.DynamicWorkspace,
				reasonText: localize('dynamicWorkspaceRecommendation', "Recommended for your current workspace.", folder.name)
			}
		};
	}
}

