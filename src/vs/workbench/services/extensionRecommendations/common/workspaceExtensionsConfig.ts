/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, distinct, flatten } from 'vs/base/common/arrays';
import { parse } from 'vs/base/common/json';
import { IFileService } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

export const EXTENSIONS_CONFIG = '.vscode/extensions.json';

export interface IExtensionsConfigContent {
	recommendations: string[];
	unwantedRecommendations: string[];
}

export const IWorkpsaceExtensionsConfigService = createDecorator<IWorkpsaceExtensionsConfigService>('IWorkpsaceExtensionsConfigService');

export interface IWorkpsaceExtensionsConfigService {
	readonly _serviceBrand: undefined;

	getExtensionsConfigs(): Promise<IExtensionsConfigContent[]>;
	getUnwantedRecommendations(): Promise<string[]>;

}

export class WorkspaceExtensionsConfigService implements IWorkpsaceExtensionsConfigService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
	) { }

	async getExtensionsConfigs(): Promise<IExtensionsConfigContent[]> {
		const workspace = this.workspaceContextService.getWorkspace();
		const result = await Promise.all([
			this.resolveWorkspaceExtensionConfig(workspace),
			...workspace.folders.map(workspaceFolder => this.resolveWorkspaceFolderExtensionConfig(workspaceFolder))
		]);
		return coalesce(result);
	}

	async getUnwantedRecommendations(): Promise<string[]> {
		const configs = await this.getExtensionsConfigs();
		return distinct(flatten(configs.map(c => c.unwantedRecommendations)));
	}

	private async resolveWorkspaceExtensionConfig(workspace: IWorkspace): Promise<IExtensionsConfigContent | null> {
		try {
			if (workspace.configuration) {
				const content = await this.fileService.readFile(workspace.configuration);
				const extensionsConfigContent = <IExtensionsConfigContent | undefined>parse(content.value.toString())['extensions'];
				return this.parseExtensionConfig(extensionsConfigContent);
			}
		} catch (e) { /* Ignore */ }
		return null;
	}

	private async resolveWorkspaceFolderExtensionConfig(workspaceFolder: IWorkspaceFolder): Promise<IExtensionsConfigContent | null> {
		try {
			const content = await this.fileService.readFile(workspaceFolder.toResource(EXTENSIONS_CONFIG));
			const extensionsConfigContent = <IExtensionsConfigContent>parse(content.value.toString());
			return this.parseExtensionConfig(extensionsConfigContent);
		} catch (e) { /* ignore */ }
		return null;
	}

	private parseExtensionConfig(extensionsConfigContent: IExtensionsConfigContent | undefined): IExtensionsConfigContent | null {
		if (extensionsConfigContent) {
			return {
				recommendations: distinct((extensionsConfigContent.recommendations || []).map(e => e.toLowerCase())),
				unwantedRecommendations: distinct((extensionsConfigContent.unwantedRecommendations || []).map(e => e.toLowerCase()))
			};
		}
		return null;
	}

}

registerSingleton(IWorkpsaceExtensionsConfigService, WorkspaceExtensionsConfigService);
