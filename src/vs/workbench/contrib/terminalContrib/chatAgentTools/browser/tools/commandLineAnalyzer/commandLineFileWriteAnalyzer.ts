/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { win32, posix } from '../../../../../../../base/common/path.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { type TreeSitterCommandParser } from '../../treeSitterCommandParser.js';
import type { ICommandLineAnalyzer, ICommandLineAnalyzerOptions, ICommandLineAnalyzerResult } from './commandLineAnalyzer.js';
import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { isString } from '../../../../../../../base/common/types.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';

export class CommandLineFileWriteAnalyzer extends Disposable implements ICommandLineAnalyzer {
	constructor(
		private readonly _treeSitterCommandParser: TreeSitterCommandParser,
		private readonly _log: (message: string, ...args: unknown[]) => void,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
	}

	async analyze(options: ICommandLineAnalyzerOptions): Promise<ICommandLineAnalyzerResult> {
		let fileWrites: URI[] | string[];
		try {
			fileWrites = await this._getFileWrites(options);
		} catch (e) {
			console.error(e);
			this._log('Failed to get file writes via grammar', options.treeSitterLanguage);
			return {
				isAutoApproveAllowed: false
			};
		}
		return this._getResult(options, fileWrites);
	}

	private async _getFileWrites(options: ICommandLineAnalyzerOptions): Promise<URI[] | string[]> {
		let fileWrites: URI[] | string[] = [];
		const capturedFileWrites = await this._treeSitterCommandParser.getFileWrites(options.treeSitterLanguage, options.commandLine);
		if (capturedFileWrites.length) {
			const cwd = options.cwd;
			if (cwd) {
				this._log('Detected cwd', cwd.toString());
				fileWrites = capturedFileWrites.map(e => {
					const isAbsolute = options.os === OperatingSystem.Windows ? win32.isAbsolute(e) : posix.isAbsolute(e);
					if (isAbsolute) {
						return URI.file(e);
					} else {
						return URI.joinPath(cwd, e);
					}
				});
			} else {
				this._log('Cwd could not be detected');
				fileWrites = capturedFileWrites;
			}
		}
		this._log('File writes detected', fileWrites.map(e => e.toString()));
		return fileWrites;
	}

	private _isSafeNullDevicePath(fileWrite: URI | string): boolean {
		const path = URI.isUri(fileWrite) ? fileWrite.fsPath : fileWrite;
		const normalizedPath = path.toLowerCase().replace(/\\/g, '/');
		
		// Unix/Linux null device
		if (normalizedPath === '/dev/null') {
			return true;
		}
		
		// Windows CMD null device (case-insensitive)
		if (normalizedPath === 'nul' || normalizedPath.endsWith('/nul') || normalizedPath.endsWith('\\nul')) {
			return true;
		}
		
		// PowerShell $null variable (appears as "$null" in the command line)
		if (path === '$null') {
			return true;
		}
		
		return false;
	}

	private _getResult(options: ICommandLineAnalyzerOptions, fileWrites: URI[] | string[]): ICommandLineAnalyzerResult {
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
							// Allow safe null device paths (check before variable detection)
							if (this._isSafeNullDevicePath(fileWrite)) {
								this._log('File write to null device allowed', URI.isUri(fileWrite) ? fileWrite.toString() : fileWrite);
								continue;
							}
							
							if (isString(fileWrite)) {
								const isAbsolute = options.os === OperatingSystem.Windows ? win32.isAbsolute(fileWrite) : posix.isAbsolute(fileWrite);
								if (!isAbsolute) {
									isAutoApproveAllowed = false;
									this._log('File write blocked due to unknown terminal cwd', fileWrite);
									break;
								}
							}
							const fileUri = URI.isUri(fileWrite) ? fileWrite : URI.file(fileWrite);
							// TODO: Handle command substitutions/complex destinations properly https://github.com/microsoft/vscode/issues/274167
							// TODO: Handle environment variables properly https://github.com/microsoft/vscode/issues/274166
							if (fileUri.fsPath.match(/[$\(\){}]/)) {
								isAutoApproveAllowed = false;
								this._log('File write blocked due to likely containing a variable', fileUri.toString());
								break;
							}
							const isInsideWorkspace = workspaceFolders.some(folder =>
								folder.uri.scheme === fileUri.scheme &&
								(fileUri.path.startsWith(folder.uri.path + '/') || fileUri.path === folder.uri.path)
							);
							if (!isInsideWorkspace) {
								isAutoApproveAllowed = false;
								this._log('File write blocked outside workspace', fileUri.toString());
								break;
							}
						}
					} else {
						// No workspace folders, allow safe null device paths even without workspace
						const hasOnlyNullDevices = fileWrites.every(fw => this._isSafeNullDevicePath(fw));
						if (!hasOnlyNullDevices) {
							isAutoApproveAllowed = false;
							this._log('File writes blocked - no workspace folders');
						}
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
			const fileWritesList = fileWrites.map(fw => `\`${URI.isUri(fw) ? this._labelService.getUriLabel(fw) : fw}\``).join(', ');
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
