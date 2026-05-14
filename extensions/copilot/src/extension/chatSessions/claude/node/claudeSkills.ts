/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Uri } from 'vscode';
import { IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { INativeEnvService } from '../../../../platform/env/common/envService';
import { IPromptsService } from '../../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../../util/common/services';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { ResourceSet } from '../../../../util/vs/base/common/map';
import { Schemas } from '../../../../util/vs/base/common/network';
import { dirname } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { resolveSkillConfigLocations } from '../../common/skillConfigLocations';

/** The Claude SDK loads `.claude` directories automatically — skip them to avoid duplicates. */
function isClaudeDirectory(uri: URI): boolean {
	return uri.path.split('/').includes('.claude');
}

export interface IClaudePluginService {
	readonly _serviceBrand: undefined;
	/**
	 * Returns plugin root directories suitable for the Claude SDK's `plugins` option.
	 *
	 * Combines two sources:
	 * 1. **Skills** — discovered as directories containing `SKILL.md` files, but the Claude SDK
	 *    plugin loader expects the *parent* of the `skills/` directory (the plugin root),
	 *    so we walk one level up from each skill location.
	 * 2. **Plugins** — returned directly by the prompts service as actual plugin root directories.
	 */
	getPluginLocations(token: CancellationToken): Promise<Uri[]>;
}

export const IClaudePluginService = createServiceIdentifier<IClaudePluginService>('IClaudePluginService');

export class ClaudePluginService extends Disposable implements IClaudePluginService {
	declare _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeEnvService private readonly envService: INativeEnvService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
		super();
	}

	async getPluginLocations(token: CancellationToken): Promise<Uri[]> {
		const pluginRoots = new ResourceSet();

		// #region Skills as plugin roots
		// Skill locations point to directories containing skill subdirectories (e.g. .../skills/).
		// The Claude SDK plugin loader expects the parent of the skills/ directory, so we
		// walk one level up from each location.
		for (const uri of resolveSkillConfigLocations(this.configurationService, this.envService, this.workspaceService)) {
			pluginRoots.add(dirname(uri));
		}

		(await this.promptsService.getSkills(token))
			.filter(s => s.uri.scheme === Schemas.file)
			.map(s => s.uri)
			.map(uri => dirname(dirname(dirname(uri))))
			.filter(uri => !isClaudeDirectory(uri))
			.forEach(uri => pluginRoots.add(uri));
		// #endregion

		// #region Plugin roots from prompts service
		(await this.promptsService.getPlugins(token))
			.filter(p => p.uri.scheme === Schemas.file)
			.filter(p => !isClaudeDirectory(p.uri))
			.map(p => p.uri)
			.forEach(uri => pluginRoots.add(uri));
		// #endregion

		return Array.from(pluginRoots);
	}
}
