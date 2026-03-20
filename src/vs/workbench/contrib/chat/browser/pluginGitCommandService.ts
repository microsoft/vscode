/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IPluginGitCommandService } from '../common/plugins/pluginGitCommandService.js';

/**
 * Default implementation of {@link IPluginGitCommandService} that delegates
 * all git operations to the git extension via {@link ICommandService}. Used
 * on the web and as the non-remote fallback on desktop.
 */
export class ExtensionPluginGitCommandService implements IPluginGitCommandService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICommandService protected readonly _commandService: ICommandService,
	) { }

	async cloneRepository(cloneUrl: string, targetDir: URI, ref?: string): Promise<void> {
		await this._commandService.executeCommand('_git.cloneRepository', cloneUrl, targetDir.fsPath, ref);
	}

	async pull(repoDir: URI): Promise<boolean> {
		return !!(await this._commandService.executeCommand<boolean>('_git.pull', repoDir.fsPath));
	}

	async checkout(repoDir: URI, treeish: string, detached?: boolean): Promise<void> {
		await this._commandService.executeCommand('_git.checkout', repoDir.fsPath, treeish, detached || undefined);
	}

	async revParse(repoDir: URI, ref: string): Promise<string> {
		return await this._commandService.executeCommand<string>('_git.revParse', repoDir.fsPath, ref) ?? '';
	}

	async fetch(repoDir: URI): Promise<void> {
		await this._commandService.executeCommand('git.fetch', repoDir.fsPath);
	}

	async openRepository(repoDir: URI): Promise<void> {
		await this._commandService.executeCommand('git.openRepository', repoDir.fsPath);
	}

	async fetchRepository(repoDir: URI): Promise<void> {
		await this._commandService.executeCommand('_git.fetchRepository', repoDir.fsPath);
	}

	async revListCount(repoDir: URI, fromRef: string, toRef: string): Promise<number> {
		return await this._commandService.executeCommand<number>('_git.revListCount', repoDir.fsPath, fromRef, toRef) ?? 0;
	}
}
