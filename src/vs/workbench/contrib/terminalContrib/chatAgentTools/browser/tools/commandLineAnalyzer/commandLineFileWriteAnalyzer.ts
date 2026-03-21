/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { win32, posix } from '../../../../../../../base/common/path.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService, type IWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { TreeSitterCommandParserLanguage, type TreeSitterCommandParser } from '../../treeSitterCommandParser.js';
import type { ICommandLineAnalyzer, ICommandLineAnalyzerOptions, ICommandLineAnalyzerResult } from './commandLineAnalyzer.js';
import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';

const nullDevice = Symbol('null device');

type FileWrite = URI | string | typeof nullDevice;

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
		let fileWrites: FileWrite[];
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

	private async _getFileWrites(options: ICommandLineAnalyzerOptions): Promise<FileWrite[]> {
		let fileWrites: FileWrite[] = [];

		// Get file writes from redirections (via tree-sitter grammar)
		const capturedFileWrites = (await this._treeSitterCommandParser.getFileWrites(options.treeSitterLanguage, options.commandLine))
			.map(this._mapNullDevice.bind(this, options));

		// Get file writes from command-specific parsers (e.g., sed -i in-place editing)
		const commandFileWrites = (await this._treeSitterCommandParser.getCommandFileWrites(options.treeSitterLanguage, options.commandLine))
			.map(this._mapNullDevice.bind(this, options));

		const allCapturedFileWrites = [...capturedFileWrites, ...commandFileWrites];

		if (allCapturedFileWrites.length) {
			const cwd = options.cwd;
			if (cwd) {
				this._log('Detected cwd', cwd.toString());
				fileWrites = allCapturedFileWrites.map(e => {
					if (e === nullDevice) {
						return e;
					}

					const normalizedPath = this._normalizePathForParsing(e, options.os);

					// Absolute
					const isAbsolute = this._isAbsolutePath(normalizedPath, options.os);
					if (isAbsolute) {
						// Ensure cwd's scheme and authority is retained
						return cwd.with({ path: normalizedPath });
					}

					// Relative
					return URI.joinPath(cwd, normalizedPath);
				});
			} else {
				this._log('Cwd could not be detected');
				fileWrites = allCapturedFileWrites;
			}
		}
		this._log('File writes detected', fileWrites.map(e => e.toString()));
		return fileWrites;
	}

	private _stripSurroundingQuotes(text: string): string {
		if (
			(text.startsWith('"') && text.endsWith('"')) ||
			(text.startsWith('\'') && text.endsWith('\''))
		) {
			return text.slice(1, -1);
		}
		return text;
	}

	private _mapNullDevice(options: ICommandLineAnalyzerOptions, rawFileWrite: string): string | typeof nullDevice {
		if (options.treeSitterLanguage === TreeSitterCommandParserLanguage.PowerShell) {
			return rawFileWrite === '$null'
				? nullDevice
				: rawFileWrite;
		}
		return rawFileWrite === '/dev/null'
			? nullDevice
			: rawFileWrite;
	}

	private _getResult(options: ICommandLineAnalyzerOptions, fileWrites: FileWrite[]): ICommandLineAnalyzerResult {
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
							if (fileWrite === nullDevice) {
								this._log('File write to null device allowed', URI.isUri(fileWrite) ? fileWrite.toString() : fileWrite);
								continue;
							}

							const fileUri = this._toFileWriteUri(fileWrite, options);
							if (!fileUri) {
								isAutoApproveAllowed = false;
								this._log('File write blocked due to unknown terminal cwd', fileWrite);
								break;
							}
							// TODO: Handle command substitutions/complex destinations properly https://github.com/microsoft/vscode/issues/274167
							// TODO: Handle environment variables properly https://github.com/microsoft/vscode/issues/274166
							if (fileUri.fsPath.match(/[$\(\){}`]/)) {
								isAutoApproveAllowed = false;
								this._log('File write blocked due to likely containing a variable or sub-command', fileUri.toString());
								break;
							}

							const isInsideWorkspace = this._isWithinWorkspace(fileUri, workspaceFolders, options.os);
							if (!isInsideWorkspace) {
								isAutoApproveAllowed = false;
								this._log('File write blocked outside workspace', fileUri.toString());
								break;
							}
						}
					} else {
						// No workspace folders, allow safe null device paths even without workspace
						const hasOnlyNullDevices = fileWrites.every(fw => fw === nullDevice);
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
			const fileWritesList = fileWrites.map(fw => `\`${URI.isUri(fw) ? this._labelService.getUriLabel(fw) : fw === nullDevice ? '/dev/null' : fw.toString()}\``).join(', ');
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

	private _isWithinWorkspace(fileUri: URI, workspaceFolders: readonly IWorkspaceFolder[], os: OperatingSystem): boolean {
		const normalizedFilePath = this._normalizePathForComparison(fileUri.path, os);
		return workspaceFolders.some(folder => {
			const folderAuthority = folder.uri.authority ?? '';
			const fileAuthority = fileUri.authority ?? '';
			if (folder.uri.scheme !== fileUri.scheme || folderAuthority !== fileAuthority) {
				return false;
			}
			const normalizedFolderPath = this._normalizePathForComparison(folder.uri.path, os);
			const folderPrefix = normalizedFolderPath.endsWith('/') ? normalizedFolderPath : `${normalizedFolderPath}/`;
			return normalizedFilePath === normalizedFolderPath || normalizedFilePath.startsWith(folderPrefix);
		});
	}

	private _toFileWriteUri(fileWrite: URI | string, options: ICommandLineAnalyzerOptions): URI | undefined {
		if (URI.isUri(fileWrite)) {
			return fileWrite;
		}

		const normalizedPath = this._normalizePathForParsing(fileWrite, options.os);
		if (!this._isAbsolutePath(normalizedPath, options.os)) {
			return undefined;
		}

		return URI.file(normalizedPath);
	}

	private _isAbsolutePath(path: string, os: OperatingSystem): boolean {
		return os === OperatingSystem.Windows ? win32.isAbsolute(path) : posix.isAbsolute(path);
	}

	private _normalizePathForComparison(path: string, os: OperatingSystem): string {
		const normalizedPath = this._normalizePathForParsing(path, os);
		return os === OperatingSystem.Windows ? normalizedPath.toLowerCase() : normalizedPath;
	}

	private _normalizePathForParsing(path: string, os: OperatingSystem): string {
		const strippedPath = this._stripSurroundingQuotes(path);
		if (os === OperatingSystem.Windows) {
			return strippedPath.replace(/\\/g, '/');
		}
		return strippedPath;
	}
}
