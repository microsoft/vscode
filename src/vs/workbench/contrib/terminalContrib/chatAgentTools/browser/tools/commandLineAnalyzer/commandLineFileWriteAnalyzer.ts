/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { win32, posix } from '../../../../../../../base/common/path.js';
import { extUri, normalizePath } from '../../../../../../../base/common/resources.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { containsCmdDelayedExpansion } from '../../../../../../../platform/terminal/common/autoApprove/cmdDelayedExpansion.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { TreeSitterCommandParserLanguage, type TreeSitterCommandParser } from '../../treeSitterCommandParser.js';
import type { ICommandLineAnalyzer, ICommandLineAnalyzerOptions, ICommandLineAnalyzerResult } from './commandLineAnalyzer.js';
import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { isString } from '../../../../../../../base/common/types.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';

const nullDevice = Symbol('null device');

interface FileWrite {
	readonly target: URI | string | typeof nullDevice;
	readonly unresolvedTarget?: string;
}

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
		// Get file writes from redirections (via tree-sitter grammar)
		const capturedFileWrites = (await this._treeSitterCommandParser.getFileWrites(options.treeSitterLanguage, options.commandLine))
			.map(this._mapNullDevice.bind(this, options));

		// Get file writes from command-specific parsers (e.g., sed -i in-place editing)
		const commandFileWrites = (await this._treeSitterCommandParser.getCommandFileWrites(options.treeSitterLanguage, options.commandLine))
			.map(this._mapNullDevice.bind(this, options));

		const allCapturedFileWrites = [...capturedFileWrites, ...commandFileWrites];

		const cwd = options.cwd;
		if (allCapturedFileWrites.length) {
			if (cwd) {
				this._log('Detected cwd', cwd.toString());
			} else {
				this._log('Cwd could not be detected');
			}
		}
		const fileWrites = allCapturedFileWrites.map((rawTarget): FileWrite => {
			if (rawTarget === nullDevice) {
				return { target: rawTarget };
			}

			let target: URI | string = rawTarget;
			if (cwd) {
				if (/^['"].*['"]$/.test(target)) {
					target = this._stripSurroundingQuotes(target);
				}
				const isAbsolute = options.os === OperatingSystem.Windows ? win32.isAbsolute(target) : posix.isAbsolute(target);
				target = isAbsolute ? cwd.with({ path: target }) : URI.joinPath(cwd, target);
			}
			return {
				target,
				unresolvedTarget: this._hasUnresolvedPath(rawTarget) ? rawTarget : undefined,
			};
		});
		this._log('File writes detected', fileWrites.map(e => e.unresolvedTarget ?? e.target.toString()));
		return fileWrites;
	}

	private _hasUnresolvedPath(path: string): boolean {
		return /[$\(\){}`~%]/.test(path) || containsCmdDelayedExpansion(path);
	}

	private _stripSurroundingQuotes(text: string): string {
		let result = text;
		while (
			(result.startsWith('"') && result.endsWith('"')) ||
			(result.startsWith('\'') && result.endsWith('\''))
		) {
			result = result.slice(1, -1);
		}
		return result;
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
						for (const { target: fileWrite } of fileWrites) {
							if (fileWrite === nullDevice) {
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
							const fileUri = normalizePath(URI.isUri(fileWrite) ? fileWrite : URI.file(fileWrite));
							// TODO: Handle command substitutions/complex destinations properly https://github.com/microsoft/vscode/issues/274167
							// TODO: Handle environment variables properly https://github.com/microsoft/vscode/issues/274166
							// `~` catches POSIX tilde expansion (e.g. `~/foo`), `%` catches Windows
							// environment variable expansion (e.g. `%APPDATA%\foo`), and the shared
							// predicate catches CMD delayed expansion (e.g. `!APPDATA!\foo`). These are
							// not recognized as absolute by `posix.isAbsolute` / `win32.isAbsolute`, so
							// without this guard they would be joined onto cwd and incorrectly classified
							// as inside the workspace while expanding at runtime to a location outside it.
							if (this._hasUnresolvedPath(fileUri.fsPath)) {
								isAutoApproveAllowed = false;
								this._log('File write blocked due to likely containing a variable, sub-command, or tilde/environment-variable expansion', fileUri.toString());
								break;
							}

							const isInsideWorkspace = workspaceFolders.some(folder =>
								folder.uri.scheme === fileUri.scheme &&
								extUri.isEqualOrParent(fileUri, folder.uri)
							);
							if (!isInsideWorkspace) {
								// Allow writes to OS temp locations when the user has opted into
								// "Allow All Commands in this Session" via the confirmation.
								if (options.hasSessionAutoApproval && this._isInTempDirectory(fileUri.path, options.os)) {
									continue;
								}
								isAutoApproveAllowed = false;
								this._log('File write blocked outside workspace', fileUri.toString());
								break;
							}
						}
					} else {
						// No workspace folders, allow safe null device paths even without workspace
						const hasOnlyNullDevices = fileWrites.every(fw => fw.target === nullDevice);
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
			const fileWritesList = fileWrites.map(({ target, unresolvedTarget }) => unresolvedTarget !== undefined
				? localize('runInTerminal.fileWriteUnresolvedPath', "`{0}` (path could not be resolved statically)", unresolvedTarget)
				: `\`${URI.isUri(target) ? this._labelService.getUriLabel(target) : target === nullDevice ? '/dev/null' : target.toString()}\``).join(', ');
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

	/**
	 * Returns true if the given URI path points inside an OS temporary directory.
	 * On posix systems this matches `/tmp/`. On Windows this matches any `temp`
	 * or `tmp` directory segment (case-insensitive), which covers the canonical
	 * user temp (`...\AppData\Local\Temp\`), system temp (`C:\Windows\Temp\`),
	 * and common dev conventions like `C:\Temp\` and `C:\tmp\`.
	 */
	private _isInTempDirectory(uriPath: string, os: OperatingSystem | undefined): boolean {
		if (os === OperatingSystem.Windows) {
			// Windows paths from URI.with({path}) keep their original backslashes,
			// so accept either separator. Require content after the segment so the
			// directory itself is not matched.
			return /[\\/]te?mp[\\/].+/i.test(uriPath);
		}
		return uriPath.startsWith('/tmp/');
	}
}
