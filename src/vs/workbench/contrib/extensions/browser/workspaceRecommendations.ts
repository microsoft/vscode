/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EXTENSION_IDENTIFIER_PATTERN } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { distinct, equals } from '../../../../base/common/arrays.js';
import { ExtensionRecommendations, ExtensionRecommendation } from './extensionRecommendations.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ExtensionRecommendationReason } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { localize } from '../../../../nls.js';
import { Emitter } from '../../../../base/common/event.js';
import { IExtensionsConfigContent, IWorkspaceExtensionsConfigService } from '../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';

const WORKSPACE_EXTENSIONS_FOLDER = '.vscode/extensions';

export class WorkspaceRecommendations extends ExtensionRecommendations {

	private _recommendations: ExtensionRecommendation[] = [];
	get recommendations(): ReadonlyArray<ExtensionRecommendation> { return this._recommendations; }

	private _onDidChangeRecommendations = this._register(new Emitter<void>());
	readonly onDidChangeRecommendations = this._onDidChangeRecommendations.event;

	private _ignoredRecommendations: string[] = [];
	get ignoredRecommendations(): ReadonlyArray<string> { return this._ignoredRecommendations; }

	private workspaceExtensions: URI[] = [];
	private readonly onDidChangeWorkspaceExtensionsScheduler: RunOnceScheduler;

	constructor(
		@IWorkspaceExtensionsConfigService private readonly workspaceExtensionsConfigService: IWorkspaceExtensionsConfigService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@IWorkbenchExtensionManagementService private readonly workbenchExtensionManagementService: IWorkbenchExtensionManagementService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.onDidChangeWorkspaceExtensionsScheduler = this._register(new RunOnceScheduler(() => this.onDidChangeWorkspaceExtensionsFolders(), 1000));
	}

	protected async doActivate(): Promise<void> {
		this.workspaceExtensions = await this.fetchWorkspaceExtensions();
		await this.fetch();

		this._register(this.workspaceExtensionsConfigService.onDidChangeExtensionsConfigs(() => this.onDidChangeExtensionsConfigs()));
		for (const folder of this.contextService.getWorkspace().folders) {
			this._register(this.fileService.watch(this.uriIdentityService.extUri.joinPath(folder.uri, WORKSPACE_EXTENSIONS_FOLDER)));
		}

		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.onDidChangeWorkspaceExtensionsScheduler.schedule()));

		this._register(this.fileService.onDidFilesChange(e => {
			if (this.contextService.getWorkspace().folders.some(folder =>
				e.affects(this.uriIdentityService.extUri.joinPath(folder.uri, WORKSPACE_EXTENSIONS_FOLDER), FileChangeType.ADDED, FileChangeType.DELETED))
			) {
				this.onDidChangeWorkspaceExtensionsScheduler.schedule();
			}
		}));
	}

	private async onDidChangeWorkspaceExtensionsFolders(): Promise<void> {
		const existing = this.workspaceExtensions;
		this.workspaceExtensions = await this.fetchWorkspaceExtensions();
		if (!equals(existing, this.workspaceExtensions, (a, b) => this.uriIdentityService.extUri.isEqual(a, b))) {
			this.onDidChangeExtensionsConfigs();
		}
	}

	private async fetchWorkspaceExtensions(): Promise<URI[]> {
		const workspaceExtensions: URI[] = [];
		for (const workspaceFolder of this.contextService.getWorkspace().folders) {
			const extensionsLocaiton = this.uriIdentityService.extUri.joinPath(workspaceFolder.uri, WORKSPACE_EXTENSIONS_FOLDER);
			try {
				const stat = await this.fileService.resolve(extensionsLocaiton);
				for (const extension of stat.children ?? []) {
					if (!extension.isDirectory) {
						continue;
					}
					workspaceExtensions.push(extension.resource);
				}
			} catch (error) {
				// ignore
			}
		}
		if (workspaceExtensions.length) {
			const resourceExtensions = await this.workbenchExtensionManagementService.getExtensions(workspaceExtensions);
			return resourceExtensions.map(extension => extension.location);
		}
		return [];
	}

	/**
	 * Parse all extensions.json files, fetch workspace recommendations, filter out invalid and unwanted ones
	 */
	private async fetch(): Promise<void> {

		const extensionsConfigs = await this.workspaceExtensionsConfigService.getExtensionsConfigs();

		const { invalidRecommendations, message } = await this.validateExtensions(extensionsConfigs);
		if (invalidRecommendations.length) {
			this.notificationService.warn(`The ${invalidRecommendations.length} extension(s) below, in workspace recommendations have issues:\n${message}`);
		}

		this._recommendations = [];
		this._ignoredRecommendations = [];

		for (const extensionsConfig of extensionsConfigs) {
			if (extensionsConfig.unwantedRecommendations) {
				for (const unwantedRecommendation of extensionsConfig.unwantedRecommendations) {
					if (invalidRecommendations.indexOf(unwantedRecommendation) === -1) {
						this._ignoredRecommendations.push(unwantedRecommendation);
					}
				}
			}
			if (extensionsConfig.recommendations) {
				for (const extensionId of extensionsConfig.recommendations) {
					if (invalidRecommendations.indexOf(extensionId) === -1) {
						this._recommendations.push({
							extension: extensionId,
							reason: {
								reasonId: ExtensionRecommendationReason.Workspace,
								reasonText: localize('workspaceRecommendation', "This extension is recommended by users of the current workspace.")
							}
						});
					}
				}
			}
		}

		for (const extension of this.workspaceExtensions) {
			this._recommendations.push({
				extension,
				reason: {
					reasonId: ExtensionRecommendationReason.Workspace,
					reasonText: localize('workspaceRecommendation', "This extension is recommended by users of the current workspace.")
				}
			});
		}
	}

	private async validateExtensions(contents: IExtensionsConfigContent[]): Promise<{ validRecommendations: string[]; invalidRecommendations: string[]; message: string }> {

		const validExtensions: string[] = [];
		const invalidExtensions: string[] = [];
		let message = '';

		const allRecommendations = distinct(contents.flatMap(({ recommendations }) => recommendations || []));
		const regEx = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
		for (const extensionId of allRecommendations) {
			if (regEx.test(extensionId)) {
				validExtensions.push(extensionId);
			} else {
				invalidExtensions.push(extensionId);
				message += `${extensionId} (bad format) Expected: <provider>.<name>\n`;
			}
		}

		return { validRecommendations: validExtensions, invalidRecommendations: invalidExtensions, message };
	}

	private async onDidChangeExtensionsConfigs(): Promise<void> {
		await this.fetch();
		this._onDidChangeRecommendations.fire();
	}

}

