/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { ExtensionPluginGitCommandService } from '../browser/pluginGitCommandService.js';

/**
 * Desktop implementation that routes git operations to the local machine
 * when connected to a remote and the target URI is a local file path
 * (the plugin cache is always local). Falls back to the extension-based
 * commands from {@link ExtensionPluginGitCommandService} otherwise.
 */
export class NativePluginGitCommandService extends ExtensionPluginGitCommandService {

	constructor(
		@ICommandService commandService: ICommandService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@ILocalGitService private readonly _localGitService: ILocalGitService,
	) {
		super(commandService);
	}

	/**
	 * Returns `true` when the target URI is a local file path but the git
	 * extension is running on a remote host — meaning we must run git
	 * locally instead of delegating to the extension.
	 */
	private _shouldUseLocalGit(uri: URI): boolean {
		return uri.scheme === Schemas.file
			&& this._remoteAgentService.getConnection() !== null;
	}

	override async cloneRepository(cloneUrl: string, targetDir: URI, ref?: string): Promise<void> {
		if (this._shouldUseLocalGit(targetDir)) {
			await this._localGitService.clone(cloneUrl, targetDir.fsPath, ref);
			return;
		}
		return super.cloneRepository(cloneUrl, targetDir, ref);
	}

	override async pull(repoDir: URI): Promise<boolean> {
		if (this._shouldUseLocalGit(repoDir)) {
			return this._localGitService.pull(repoDir.fsPath);
		}
		return super.pull(repoDir);
	}

	override async checkout(repoDir: URI, treeish: string, detached?: boolean): Promise<void> {
		if (this._shouldUseLocalGit(repoDir)) {
			await this._localGitService.checkout(repoDir.fsPath, treeish, detached);
			return;
		}
		return super.checkout(repoDir, treeish, detached);
	}

	override async revParse(repoDir: URI, ref: string): Promise<string> {
		if (this._shouldUseLocalGit(repoDir)) {
			return this._localGitService.revParse(repoDir.fsPath, ref);
		}
		return super.revParse(repoDir, ref);
	}

	override async fetch(repoDir: URI): Promise<void> {
		if (this._shouldUseLocalGit(repoDir)) {
			await this._localGitService.fetch(repoDir.fsPath);
			return;
		}
		return super.fetch(repoDir);
	}

	override async openRepository(repoDir: URI): Promise<void> {
		// When using local git, there is no need to register the repository
		// with the remote git extension — it cannot see local paths anyway.
		if (this._shouldUseLocalGit(repoDir)) {
			return;
		}
		return super.openRepository(repoDir);
	}

	override async fetchRepository(repoDir: URI): Promise<void> {
		if (this._shouldUseLocalGit(repoDir)) {
			await this._localGitService.fetch(repoDir.fsPath);
			return;
		}
		return super.fetchRepository(repoDir);
	}

	override async revListCount(repoDir: URI, fromRef: string, toRef: string): Promise<number> {
		if (this._shouldUseLocalGit(repoDir)) {
			return this._localGitService.revListCount(repoDir.fsPath, fromRef, toRef);
		}
		return super.revListCount(repoDir, fromRef, toRef);
	}
}
