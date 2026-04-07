/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Emitter } from '../../../util/vs/base/common/event';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { ExcludeSettingOptions } from '../../../vscodeTypes';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { RelativePattern } from '../../filesystem/common/fileTypes';
import { IGitService } from '../../git/common/gitService';
import { ILogService } from '../../log/common/logService';
import { IRequestLogger } from '../../requestLogger/node/requestLogger';
import { ISearchService } from '../../search/common/searchService';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { IIgnoreService } from '../common/ignoreService';
import { IgnoreFile } from './ignoreFile';
import { RemoteContentExclusion } from './remoteContentExclusion';

export const COPILOT_IGNORE_FILE_NAME = '.copilotignore';

export class BaseIgnoreService implements IIgnoreService {

	declare readonly _serviceBrand: undefined;

	private readonly _copilotIgnoreFiles = new IgnoreFile();
	private _remoteContentExclusions: RemoteContentExclusion | undefined;
	private _copilotIgnoreEnabled = false;
	private readonly _onDidChangeCopilotIgnoreEnablement = new Emitter<boolean>();

	protected _disposables: IDisposable[] = [];
	protected onDidChangeCopilotIgnoreEnablement = this._onDidChangeCopilotIgnoreEnablement.event;

	constructor(

		private readonly _gitService: IGitService,
		private readonly _logService: ILogService,
		private readonly _authService: IAuthenticationService,
		private readonly _workspaceService: IWorkspaceService,
		private readonly _capiClientService: ICAPIClientService,
		private readonly searchService: ISearchService,
		private readonly fs: IFileSystemService,
		private readonly _requestLogger: IRequestLogger,
	) {
		this._disposables.push(this._onDidChangeCopilotIgnoreEnablement);
		this._disposables.push(this._authService.onDidAuthenticationChange(() => {
			const copilotIgnoreEnabled = this._authService.copilotToken?.isCopilotIgnoreEnabled() ?? false;
			if (this._copilotIgnoreEnabled !== copilotIgnoreEnabled) {
				this._onDidChangeCopilotIgnoreEnablement.fire(copilotIgnoreEnabled);
			}
			this._copilotIgnoreEnabled = copilotIgnoreEnabled;
			if (this._copilotIgnoreEnabled === false && this._remoteContentExclusions) {
				this._remoteContentExclusions.dispose();
				this._remoteContentExclusions = undefined;
			}
			if (this._copilotIgnoreEnabled === true && !this._remoteContentExclusions) {
				this._remoteContentExclusions = new RemoteContentExclusion(
					this._gitService,
					this._logService,
					this._authService,
					this._capiClientService,
					this.fs,
					this._workspaceService,
					this._requestLogger
				);
			}
		}));
	}

	dispose(): void {
		this._disposables.forEach(d => d.dispose());
		if (this._remoteContentExclusions) {
			this._remoteContentExclusions.dispose();
			this._remoteContentExclusions = undefined;
		}
		this._disposables = [];
	}

	get isEnabled(): boolean {
		return this._copilotIgnoreEnabled;
	}

	get isRegexExclusionsEnabled(): boolean {
		return this._remoteContentExclusions?.isRegexContextExclusionsEnabled ?? false;
	}

	public async isCopilotIgnored(file: URI, token?: CancellationToken): Promise<boolean> {
		let copilotIgnored = false;
		if (this._copilotIgnoreEnabled) {
			const localCopilotIgnored = this._copilotIgnoreFiles.isIgnored(file);
			copilotIgnored = localCopilotIgnored || await (this._remoteContentExclusions?.isIgnored(file, token) ?? false);
		}
		return copilotIgnored;
	}


	async asMinimatchPattern(): Promise<string | undefined> {
		if (!this._copilotIgnoreEnabled) {
			return;
		}
		const all: string[][] = [];

		const gitRepoRoots = (await this.searchService.findFiles('**/.git/HEAD', {
			useExcludeSettings: ExcludeSettingOptions.None,
		})).map(uri => URI.joinPath(uri, '..', '..'));
		// Loads the repositories in prior to requesting the patterns so that they're "discovered" and available
		await this._remoteContentExclusions?.loadRepos(gitRepoRoots);

		all.push(await this._remoteContentExclusions?.asMinimatchPatterns() ?? []);
		all.push(this._copilotIgnoreFiles.asMinimatchPatterns());

		const allall = all.flat();
		if (allall.length === 0) {
			return undefined;
		} else if (allall.length === 1) {
			return allall[0];
		} else {
			return `{${allall.join(',')}}`;
		}
	}

	private _init: Promise<void> | undefined;

	public init(): Promise<void> {
		this._init ??= (async () => {
			for (const folder of this._workspaceService.getWorkspaceFolders()) {
				await this.addWorkspace(folder);
			}
		})();
		return this._init;
	}

	protected trackIgnoreFile(workspaceRoot: URI | undefined, ignoreFile: URI, contents: string) {
		// Check if the ignore file is a copilotignore file
		if (ignoreFile.path.endsWith(COPILOT_IGNORE_FILE_NAME)) {
			this._copilotIgnoreFiles.setIgnoreFile(workspaceRoot, ignoreFile, contents);
		}
		return;
	}

	protected removeIgnoreFile(ignoreFile: URI) {
		// Check if the ignore file is a copilotignore file
		if (ignoreFile.path.endsWith(COPILOT_IGNORE_FILE_NAME)) {
			this._copilotIgnoreFiles.removeIgnoreFile(ignoreFile);
		}
		return;
	}

	protected removeWorkspace(workspace: URI) {
		this._copilotIgnoreFiles.removeWorkspace(workspace);
	}

	protected isIgnoreFile(fileUri: URI) {
		// Check if the file is a copilotignore file
		if (fileUri.path.endsWith(COPILOT_IGNORE_FILE_NAME)) {
			return true;
		}
		return false;
	}

	protected async addWorkspace(workspaceUri: URI) {
		if (workspaceUri.scheme !== 'file') {
			return;
		}

		const files: URI[] = await this.searchService.findFilesWithDefaultExcludes(new RelativePattern(workspaceUri, `${COPILOT_IGNORE_FILE_NAME}`), undefined, CancellationToken.None);
		for (const file of files) {
			const contents = (await this.fs.readFile(file)).toString();
			this.trackIgnoreFile(workspaceUri, file, contents);
		}
	}
}
