/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { IHistoryService } from '../../../../../../services/history/common/history.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import type { TreeSitterCommandParser } from '../../treeSitterCommandParser.js';
import type { ICommandLineAnalyzer, ICommandLineAnalyzerOptions, ICommandLineAnalyzerResult } from './commandLineAnalyzer.js';

export class CommandLineFileWriteAnalyzer extends Disposable implements ICommandLineAnalyzer {
	constructor(
		private readonly _treeSitterCommandParser: TreeSitterCommandParser,
		private readonly _log: (message: string, ...args: unknown[]) => void,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHistoryService private readonly _historyService: IHistoryService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
	}

	async analyze(options: ICommandLineAnalyzerOptions): Promise<ICommandLineAnalyzerResult> {
		return this._getResult(await this._getFileWrites(options));
	}

	private async _getFileWrites(options: ICommandLineAnalyzerOptions): Promise<URI[] | string[]> {
		let fileWrites: URI[] | string[] = [];
		const capturedFileWrites = await this._treeSitterCommandParser.getFileWrites(options.treeSitterLanguage, options.commandLine);
		// TODO: Handle environment variables https://github.com/microsoft/vscode/issues/274166
		// TODO: Handle command substitions/complex destinations https://github.com/microsoft/vscode/issues/274167
		if (capturedFileWrites.length) {
			let cwd = await options.instance?.getCwdResource();
			if (!cwd) {
				const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
				const workspaceFolder = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? undefined : undefined;
				cwd = workspaceFolder?.uri;
			}
			if (cwd) {
				fileWrites = capturedFileWrites.map(e => URI.joinPath(cwd, e));
			} else {
				this._log('Cwd could not be detected');
				fileWrites = capturedFileWrites;
			}
		}
		this._log('File writes detected', fileWrites.map(e => e.toString()));
		return fileWrites;
	}

	private _getResult(fileWrites: URI[] | string[]): ICommandLineAnalyzerResult {
		let isAutoApproveAllowed = true;
		if (fileWrites.length > 0) {
			const blockDetectedFileWrites = this._configurationService.getValue<string>(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites);
			switch (blockDetectedFileWrites) {
				case 'all': {
					isAutoApproveAllowed = false;
					this._log('File writes blocked due to "all" setting');
					break;
				}
				case 'outsideWorkspace': {
					const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
					if (workspaceFolders.length > 0) {
						for (const fileWrite of fileWrites) {
							const fileUri = URI.isUri(fileWrite) ? fileWrite : URI.file(fileWrite);
							const isInsideWorkspace = workspaceFolders.some(folder =>
								folder.uri.scheme === fileUri.scheme &&
								(fileUri.path.startsWith(folder.uri.path + '/') || fileUri.path === folder.uri.path)
							);
							if (!isInsideWorkspace) {
								isAutoApproveAllowed = false;
								this._log(`File write blocked outside workspace: ${fileUri.toString()}`);
								break;
							}
						}
					} else {
						// No workspace folders, consider all writes as outside workspace
						isAutoApproveAllowed = false;
						this._log('File writes blocked - no workspace folders');
					}
					break;
				}
				case 'never':
				default: {
					break;
				}
			}
		}

		const disclaimers: string[] = [];
		if (fileWrites.length > 0) {
			const fileWritesList = fileWrites.map(fw => `\`${URI.isUri(fw) ? fw.fsPath : fw}\``).join(', ');
			if (!isAutoApproveAllowed) {
				disclaimers.push(localize('runInTerminal.fileWriteBlockedDisclaimer', 'File write operations detected that cannot be auto approved: {0}', fileWritesList));
			} else {
				disclaimers.push(localize('runInTerminal.fileWriteDisclaimer', 'File write operations detected: {0}', fileWritesList));
			}
		}
		return {
			isAutoApproveAllowed,
			disclaimers,
		};
	}
}
