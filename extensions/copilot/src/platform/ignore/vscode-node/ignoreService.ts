/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace } from 'vscode';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { VSCodeFileSystemService } from '../../filesystem/vscode/fileSystemServiceImpl';
import { IGitExtensionService } from '../../git/common/gitExtensionService';
import { IGitService } from '../../git/common/gitService';
import { ILogService } from '../../log/common/logService';
import { IRequestLogger } from '../../requestLogger/node/requestLogger';
import { BaseSearchServiceImpl } from '../../search/vscode/baseSearchServiceImpl';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { BaseIgnoreService } from '../node/ignoreServiceImpl';


export class VsCodeIgnoreService extends BaseIgnoreService {

	constructor(
		@IGitService _gitService: IGitService,
		@IGitExtensionService _gitExtensionService: IGitExtensionService,
		@ILogService _logService: ILogService,
		@IAuthenticationService _authService: IAuthenticationService,
		@IWorkspaceService _workspaceService: IWorkspaceService,
		@ICAPIClientService _capiClientService: ICAPIClientService,
		@IRequestLogger _requestLogger: IRequestLogger
	) {
		super(
			_gitService,
			_logService,
			_authService,
			_workspaceService,
			_capiClientService,
			new BaseSearchServiceImpl(),
			new VSCodeFileSystemService(),
			_requestLogger
		);
		this.installListeners();
	}

	private installListeners() {
		this._disposables.push(workspace.onDidChangeWorkspaceFolders(e => {
			for (const folder of e.removed) {
				this.removeWorkspace(folder.uri);
			}
			for (const folder of e.added) {
				this.addWorkspace(folder.uri);
			}
		}));

		// Lets watch for changed .copilotignore files
		this._disposables.push(
			workspace.onDidSaveTextDocument(async doc => {
				if (this.isIgnoreFile(doc.uri)) {
					const contents = (await workspace.fs.readFile(doc.uri)).toString();
					const folder = workspace.getWorkspaceFolder(doc.uri);
					this.trackIgnoreFile(folder?.uri, doc.uri, contents);
				}
			}),
			workspace.onDidDeleteFiles(e => {
				for (const f of e.files) {
					this.removeIgnoreFile(f);
				}
			}),
			workspace.onDidRenameFiles(async e => {
				for (const f of e.files) {
					if (this.isIgnoreFile(f.newUri)) {
						const contents = (await workspace.fs.readFile(f.newUri)).toString();
						this.removeIgnoreFile(f.oldUri);
						const folder = workspace.getWorkspaceFolder(f.newUri);
						this.trackIgnoreFile(folder?.uri, f.newUri, contents);
					}
				}
			})
		);
	}

}
